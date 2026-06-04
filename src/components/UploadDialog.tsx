import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ImagePlus, Upload, MapPin, Loader2, ShieldCheck } from "lucide-react";

type Loc = { lat: number; lng: number; label: string | null };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const safeRandomId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
};

export function UploadDialog({ userId, onUploaded }: { userId: string; onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [caption, setCaption] = useState("");
  const [loc, setLoc] = useState<Loc | null>(null);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  function pick(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function tagLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }

    setLocLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let label: string | null = null;

        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
            { headers: { Accept: "application/json" } },
          );

          const j = await r.json();
          const a = j.address ?? {};

          label =
            [a.city || a.town || a.village || a.suburb, a.state, a.country]
              .filter(Boolean)
              .join(", ") ||
            j.display_name ||
            null;
        } catch {
          // Ignore location label lookup errors.
        }

        setLoc({ lat, lng, label });
        setLocLoading(false);
        toast.success(label ? `Tagged: ${label}` : "Location tagged");
      },
      (err) => {
        setLocLoading(false);

        if (err.message?.includes("permission") || err.code === 1) {
          toast.error(
            "Location is blocked. Open this app with an HTTPS link, like ngrok, then allow location.",
          );
          return;
        }

        toast.error(err.message || "Couldn't get location");
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  async function handleUpload() {
    if (!file) return;

    if (!subjectName.trim()) {
      toast.error("Add their name");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error("Keep it under 8MB");
      return;
    }

    if (!privacyAgreed) {
      toast.error("Please agree to the public-place and privacy statement before posting.");
      return;
    }

    setLoading(true);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${safeRandomId()}.${ext}`;

      const { error: upErr } = await supabase.storage.from("photos").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });

      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("photos").getPublicUrl(path);

      const { error: insErr } = await supabase.from("posts").insert({
        user_id: userId,
        image_url: publicUrl,
        caption: caption.trim() || null,
        subject_name: subjectName.trim(),
        latitude: loc?.lat ?? null,
        longitude: loc?.lng ?? null,
        location_name: loc?.label ?? null,
      });

      if (insErr) throw insErr;

      toast.success("Posted 🔥");
      setOpen(false);
      setFile(null);
      setPreview(null);
      setCaption("");
      setSubjectName("");
      setLoc(null);
      setPrivacyAgreed(false);
      onUploaded();
    } catch (err) {
      toast.error(getErrorMessage(err, "Upload failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full font-semibold gap-2 h-11 px-5 shadow-lg shadow-primary/30">
          <ImagePlus className="size-4" />
          Post a pic
        </Button>
      </DialogTrigger>

      <DialogContent className="rounded-3xl max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">New post</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block">
            <div className="aspect-[4/5] rounded-2xl border-2 border-dashed border-border bg-muted/50 overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary transition">
              {preview ? (
                <img src={preview} alt="preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center text-muted-foreground">
                  <Upload className="size-8 mx-auto mb-2" />
                  <p className="text-sm font-medium">Tap to choose a pic</p>
                </div>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </label>

          <Input
            placeholder="Their name *"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            maxLength={80}
            className="rounded-2xl"
          />

          <Textarea
            placeholder="Say something… (optional)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={280}
            className="rounded-2xl resize-none"
            rows={2}
          />

          <Button
            type="button"
            variant="outline"
            onClick={tagLocation}
            disabled={locLoading}
            className="w-full rounded-full h-10 gap-2"
          >
            {locLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MapPin className="size-4" />
            )}
            {loc
              ? (loc.label ?? `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`)
              : "Tag my location"}
          </Button>

          <label className="flex items-start gap-3 rounded-2xl border-2 border-primary bg-primary/10 p-4 cursor-pointer">
            <Checkbox
              checked={privacyAgreed}
              onCheckedChange={(value) => setPrivacyAgreed(value === true)}
              className="mt-1 size-5"
              aria-label="Agree to public place and privacy rights statement"
            />
            <span className="text-lg font-black uppercase leading-tight text-primary">
              I agree that this photo was taken in a public place and I am not violating any privacy
              rights
            </span>
          </label>

          <Button
            onClick={handleUpload}
            disabled={!file || !privacyAgreed || loading}
            className="w-full rounded-full h-11 font-semibold"
          >
            {loading ? "Posting…" : "Post it"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
