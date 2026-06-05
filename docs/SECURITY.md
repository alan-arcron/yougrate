# Yougrate Security Notes

This document covers the security-relevant configuration that lives **outside** the
codebase (AWS, environment) and summarizes the in-code hardening. Read this before
deploying to production.

---

## 1. Required environment variables

| Variable | Why it matters |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | **Required in production.** Encrypts GitHub/Vercel access tokens at rest (AES-256-GCM). If unset, tokens are stored in **plaintext** and the server logs a warning. Generate with `openssl rand -base64 48`. Rotating this value makes previously stored tokens unreadable (users would simply reconnect GitHub/Vercel). |
| `ADMIN_EMAILS` | Comma-separated allowlist that grants admin (cross-tenant) access. Keep this tight. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Should belong to an IAM user/role scoped to **only** the Yougrate bucket and SES (see below). |

After setting `TOKEN_ENCRYPTION_KEY`, run migrations (`npm run migrate` in `server/`)
— migration `20260605_009_encrypt_tokens` encrypts any existing plaintext tokens.
It is idempotent and safe to re-run.

---

## 2. S3 bucket configuration (must be applied in AWS)

The application now treats **all** S3 objects as private. Support-ticket images are
read only through short-lived presigned GET URLs minted by the server after an auth
check; workspace files are never exposed to clients at all. The bucket itself must be
locked down:

### 2a. Block Public Access

Enable **all four** Block Public Access settings on the bucket:

- Block public access to buckets and objects granted through *new* ACLs
- Block public access to buckets and objects granted through *any* ACLs
- Block public access to buckets and objects granted through *new* public bucket or access point policies
- Block public access through *any* public bucket or access point policies

(Console: S3 → bucket → Permissions → Block public access → Edit → check all → Save.)

### 2b. No public bucket policy

Ensure there is **no** bucket policy granting `s3:GetObject` to `Principal: "*"`.
Access happens exclusively via the server's IAM credentials and presigned URLs.

### 2c. Recommended bucket policy — enforce TLS and bucket-owner ownership

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::yougrate",
        "arn:aws:s3:::yougrate/*"
      ],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

Also set **Object Ownership = Bucket owner enforced** (disables ACLs entirely).

### 2d. Recommended: default encryption + lifecycle

- Enable **SSE-S3** (or SSE-KMS) default encryption on the bucket.
- Add a lifecycle rule to expire/clean old `workspaces/` objects (the app does not
  delete them automatically). Support images under `support/` can have a longer
  retention.

---

## 3. IAM policy for the application credentials

Scope the access key to only what the app needs. Example least-privilege policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "YougrateBucketObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::yougrate/*"
    },
    {
      "Sid": "YougrateBucketList",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::yougrate"
    },
    {
      "Sid": "YougrateSesSend",
      "Effect": "Allow",
      "Action": ["ses:SendEmail"],
      "Resource": "*"
    }
  ]
}
```

Do **not** attach `s3:*` or account-wide S3 permissions to this key.

---

## 4. Object key layout & access model

| Prefix | Contents | Who can read |
|---|---|---|
| `workspaces/{projectId}/{migrationId}/...` | Cloned source + AI-migrated output | Server only (IAM). Never served to clients. |
| `support/{userId}/{uuid}.{ext}` | Support-ticket attachments | Owner via `POST /api/support/image-url` (verifies the key is under their own prefix); admins via the admin tickets endpoint. Both return 15-min presigned GET URLs. |

Keys are UUID-based and never enumerable without auth. With Block Public Access on,
guessing a key is useless without AWS credentials.

---

## 5. In-code hardening already applied

- **Tokens encrypted at rest** (AES-256-GCM) and **redacted from all logs** (git
  errors that embed `x-access-token:...@github.com` are scrubbed at the source and
  again in the global error handler / stored migration error messages).
- **Repo access verification:** creating a project verifies the repo is accessible by
  the requesting user's own GitHub token; pushing to the original repo (branch/fork
  modes) requires verified `push` permission.
- **IDOR:** every migration endpoint resolves ownership in one step
  (`getOwnedMigration`) and returns a uniform `404`, checking ownership *before*
  status to avoid existence/status enumeration. `/api/migrations` is now rate-limited.
- **Prompt-injection / LLM:**
  - Secret files (`.env*`, `*.pem`, `*.key`, `id_rsa`, `credentials`, `*.secret`,
    etc.) are **never** sent to the LLM (they still carry over to the output repo
    unchanged via the clone).
  - Model-produced file paths are validated to stay within the workspace
    (`isSafeRelativePath` / `safeJoin`) before any write to disk or S3, blocking
    path traversal from `fixBuildErrors`.
  - `modelOverride` is constrained to a pricing allowlist; arbitrary model strings
    are ignored.
  - `fixBuildErrors` input is size-capped (per-file and total) to bound token usage.
- **Support uploads:** presigned PUT is auth-gated and content-type-restricted;
  attachment keys are validated to belong to the uploading user; emails link to the
  admin page instead of embedding object URLs.

---

## 6. Residual risks / things to watch

- **Secrets committed in the user's own repo.** *(Mitigated.)* Committed secret files
  (`.env`, `*.pem`, `*.key`, `id_rsa`, `credentials`, …; safe `.env.example`/templates
  excepted) are detected during analysis, **never sent to the LLM**, and **stripped
  from the pushed output repo** (with matching `.gitignore` entries added). The
  detected files are recorded on the migration (`committed_secrets`) and surfaced to
  the user in a banner advising them to **rotate** the exposed secrets, since they were
  already committed to the source repo.
- **Anthropic as a data processor.** *(Disclosed.)* Non-secret source file contents are
  sent to Anthropic for analysis/migration. This is covered in the Privacy Policy
  (section 4) and disclosed in-app in the pre-payment notice, which links to the Terms
  and Privacy Policy. Per Anthropic's API terms, API data is not used to train models.
  Ensure any DPA you sign with customers reflects this sub-processor.
- **Prompt injection is mitigated, not eliminated.** A malicious repo file can still
  attempt to steer the model. The blast radius is bounded (own repo only, no secret
  exfil channel, no path traversal, no server-side execution). Generated code is
  deployed to the user's own Vercel project, and the migration view now shows a
  prominent "review AI-generated code before production" banner. Review output for
  high-trust use cases.
- **Workspace retention.** S3 workspace objects under `workspaces/` are not deleted
  automatically (`deleteWorkspace` exists but is unused). Add a lifecycle rule
  (section 2d) — note the Privacy Policy implies temporary retention.
- **Admin model is allowlist-only.** Anyone in `ADMIN_EMAILS` with a valid session has
  full cross-tenant read access. Keep the list minimal and protect those accounts.
