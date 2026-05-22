import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, X, Bug, HelpCircle, CheckCircle2, Loader2 } from "lucide-react";

interface ImageUpload {
  file: File;
  preview: string;
  uploading: boolean;
  url?: string;
}

export default function Support() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState(profile?.email || "");
  const [images, setImages] = useState<ImageUpload[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function uploadImage(file: File): Promise<string> {
    const { uploadUrl, imageUrl } = await api.post<{
      uploadUrl: string;
      imageUrl: string;
    }>("/support/upload-url", {
      filename: file.name,
      contentType: file.type,
    });

    await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });

    return imageUrl;
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const newImages: ImageUpload[] = [];
    for (let i = 0; i < fileList.length && images.length + newImages.length < 3; i++) {
      const file = fileList[i];
      if (!file.type.startsWith("image/")) continue;
      newImages.push({ file, preview: URL.createObjectURL(file), uploading: false });
    }
    setImages((prev) => [...prev, ...newImages]);
  }

  function removeImage(idx: number) {
    setImages((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[idx].preview);
      copy.splice(idx, 1);
      return copy;
    });
  }

  async function handleSubmit(type: "bug" | "question") {
    if (!subject.trim() || !description.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    if (type === "bug" && !session) {
      toast.error("Please log in to report a bug");
      return;
    }
    if (type === "question" && !session && !email.trim()) {
      toast.error("Please provide your email address");
      return;
    }

    setSubmitting(true);
    try {
      let imageUrls: string[] = [];
      if (type === "bug" && images.length > 0) {
        imageUrls = await Promise.all(images.map((img) => uploadImage(img.file)));
      }

      await api.post("/support/tickets", {
        type,
        subject: subject.trim(),
        description: description.trim(),
        email: email.trim() || undefined,
        image_urls: imageUrls,
      });

      setSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <CheckCircle2 className="h-16 w-16 text-primary mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2">We got it!</h1>
        <p className="text-muted-foreground mb-6">
          Thanks for reaching out. We'll review your submission and get back to
          you as soon as possible.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go Back
          </Button>
          <Button
            onClick={() => {
              setSubmitted(false);
              setSubject("");
              setDescription("");
              setImages([]);
            }}
          >
            Submit Another
          </Button>
        </div>
      </div>
    );
  }

  const bugForm = (
    <div className="space-y-4">
      {!session && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="py-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              You need to be logged in to report a bug.{" "}
              <button
                onClick={() => navigate("/login")}
                className="text-primary underline"
              >
                Log in
              </button>
            </p>
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        <Label htmlFor="bug-subject">Subject</Label>
        <Input
          id="bug-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief summary of the issue"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bug-description">Description</Label>
        <textarea
          id="bug-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Steps to reproduce, expected behavior, what happened instead..."
          className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-2">
        <Label>Screenshots (up to 3)</Label>
        <div className="flex flex-wrap gap-3">
          {images.map((img, i) => (
            <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border">
              <img src={img.preview} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {images.length < 3 && (
            <button
              onClick={() => fileInput.current?.click()}
              className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Upload className="h-5 w-5" />
              <span className="text-xs">Upload</span>
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>
      <Button
        onClick={() => handleSubmit("bug")}
        disabled={submitting || !session}
        className="w-full"
      >
        {submitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Bug className="mr-2 h-4 w-4" />
        )}
        {submitting ? "Submitting..." : "Submit Bug Report"}
      </Button>
    </div>
  );

  const questionForm = (
    <div className="space-y-4">
      {!session && (
        <div className="space-y-2">
          <Label htmlFor="q-email">Your Email</Label>
          <Input
            id="q-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="q-subject">Subject</Label>
        <Input
          id="q-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What's your question about?"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="q-description">Message</Label>
        <textarea
          id="q-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell us more..."
          className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Button
        onClick={() => handleSubmit("question")}
        disabled={submitting}
        className="w-full"
      >
        {submitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <HelpCircle className="mr-2 h-4 w-4" />
        )}
        {submitting ? "Submitting..." : "Submit Question"}
      </Button>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-2">Support</h1>
      <p className="text-muted-foreground mb-8">
        Found a bug or have a question? We're here to help.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Contact Us</CardTitle>
          <CardDescription>
            Choose the type of request below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            defaultValue="question"
            onValueChange={() => {
              setSubject("");
              setDescription("");
              setImages([]);
            }}
          >
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="bug">
                <Bug className="mr-2 h-4 w-4" />
                Report a Bug
              </TabsTrigger>
              <TabsTrigger value="question">
                <HelpCircle className="mr-2 h-4 w-4" />
                General Question
              </TabsTrigger>
            </TabsList>
            <TabsContent value="bug">{bugForm}</TabsContent>
            <TabsContent value="question">{questionForm}</TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
