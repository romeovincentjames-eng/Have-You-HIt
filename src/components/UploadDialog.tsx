import { useEffect, useRef, useState } from "react";
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
import { CommunityGuidelinesList } from "@/components/CommunityGuidelines";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

type Loc = { lat: number; lng: number; label: string | null };
type Gender = "man" | "woman";
type UserOption = { id: string; display_name: string; gender: Gender | null };

const IMAGE_FILE_NAME = /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const safeRandomId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
};

function isImageFile(file: File) {
  return file.type.startsWith("image/") || IMAGE_FILE_NAME.test(file.name);
}

function oppositeGender(gender: Gender) {
  return gender === "man" ? "woman" : "man";
}

export function UploadDialog({
  userId,
  currentGender,
  onUploaded,
}: {
  userId: string;
  currentGender: Gender;
  onUploaded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [userOptionsLoading, setUserOptionsLoading] = useState(false);
  const [caption, setCaption] = useState("");
  const [loc, setLoc] = useState<Loc | null>(null);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [guidelinesOpened, setGuidelinesOpened] = useState(false);
  const [guidelinesExpanded, setGuidelinesExpanded] = useState(false);
  const [guidelinesAgreed, setGuidelinesAgreed] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewReadId = useRef(0);
  const selectedUser = userOptions.find((option) => option.id === targetUserId);
  const filteredUserOptions = userOptions.filter((option) =>
    option.display_name.toLowerCase().includes(userSearch.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadUsers() {
      setUserOptionsLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name,gender")
        .neq("id", userId)
        .eq("gender", oppositeGender(currentGender))
        .order("display_name", { ascending: true })
        .limit(100);

      if (cancelled) return;

      if (error) {
        toast.error(error.message);
        setUserOptions([]);
      } else {
        setUserOptions((data as UserOption[] | null) ?? []);
      }

      setUserOptionsLoading(false);
    }

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, [currentGender, open, userId]);

  function pick(f: File | null) {
    previewReadId.current += 1;

    if (!f) {
      setFile(null);
      setPreview(null);
      setPreviewError("");
      return;
    }

    if (!isImageFile(f)) {
      toast.error("Choose an image file.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (f.size > 8 * 1024 * 1024) {
      toast.error("Keep it under 8MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setFile(f);
    setPreview(null);
    setPreviewError("");

    const readId = previewReadId.current;
    const reader = new FileReader();

    reader.onload = () => {
      if (readId !== previewReadId.current) return;

      if (typeof reader.result === "string") {
        setPreview(reader.result);
        return;
      }

      setPreviewError("Preview could not load. Choose another photo.");
    };

    reader.onerror = () => {
      if (readId !== previewReadId.current) return;
      setPreviewError("Preview could not load. Choose another photo.");
    };

    reader.readAsDataURL(f);
  }

  function removePhoto() {
    pick(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function toggleGuidelines() {
    setGuidelinesOpened(true);
    setGuidelinesExpanded((current) => !current);
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

    const targetUser = userOptions.find((option) => option.id === targetUserId);

    if (!targetUser) {
      toast.error("Choose another app user for the main feed.");
      return;
    }

    if (targetUser.id === userId) {
      toast.error("Main feed posts have to be about another user.");
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

    if (!guidelinesOpened) {
      toast.error("Please open the Community Guidelines before posting.");
      return;
    }

    if (!guidelinesAgreed) {
      toast.error("Please agree to follow the Community Guidelines before posting.");
      return;
    }

    setLoading(true);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${safeRandomId()}.${ext}`;

      const { error: upErr } = await supabase.storage.from("photos").upload(path, file, {
        ...(file.type ? { contentType: file.type } : {}),
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
        subject_name: targetUser.display_name,
        target_user_id: targetUser.id,
        latitude: loc?.lat ?? null,
        longitude: loc?.lng ?? null,
        location_name: loc?.label ?? null,
      });

      if (insErr) throw insErr;

      toast.success("Posted 🔥");
      setOpen(false);
      setFile(null);
      setPreview(null);
      setPreviewError("");
      setCaption("");
      setTargetUserId("");
      setUserSearch("");
      setLoc(null);
      setPrivacyAgreed(false);
      setGuidelinesOpened(false);
      setGuidelinesExpanded(false);
      setGuidelinesAgreed(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

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
          Post someone
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[92svh] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">New post</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block">
              <div className="aspect-[4/5] rounded-2xl border-2 border-dashed border-border bg-muted/50 overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary transition">
                {preview && !previewError ? (
                  <img
                    src={preview}
                    alt="Selected photo preview"
                    className="h-full w-full object-contain"
                    onError={() => setPreviewError("Preview could not load. Choose another photo.")}
                  />
                ) : file ? (
                  <div className="px-5 text-center text-muted-foreground">
                    <ImagePlus className="mx-auto mb-2 size-8" />
                    <p className="text-sm font-semibold">
                      {previewError || "Loading photo preview..."}
                    </p>
                    <p className="mt-1 break-all text-xs">{file.name}</p>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Upload className="mx-auto mb-2 size-8" />
                    <p className="text-sm font-medium">Tap to choose a pic</p>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
            </label>

            {file && (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 px-3 py-2 text-sm">
                <span className="min-w-0 truncate font-semibold text-muted-foreground">
                  {file.name}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={removePhoto}
                  className="h-8 shrink-0 rounded-full px-3 text-xs font-semibold"
                >
                  Remove
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-primary">
              Search a registered user *
            </label>
            <div className="rounded-2xl border border-input bg-background p-2">
              {selectedUser ? (
                <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-muted px-3">
                  <span className="min-w-0 truncate text-sm font-black">
                    @{selectedUser.display_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetUserId("");
                      setUserSearch("");
                    }}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                    aria-label="Clear selected user"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                      disabled={userOptionsLoading}
                      placeholder={
                        userOptionsLoading ? "Loading registered users..." : "Search by name"
                      }
                      className="h-11 rounded-xl border-0 bg-muted pl-9 pr-3 font-semibold"
                    />
                  </div>

                  <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {filteredUserOptions.slice(0, 12).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setTargetUserId(option.id);
                          setUserSearch(option.display_name);
                        }}
                        className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-muted"
                      >
                        <span className="min-w-0 truncate">@{option.display_name}</span>
                        <CheckCircle2 className="size-4 shrink-0 text-primary" />
                      </button>
                    ))}

                    {!userOptionsLoading && userOptions.length > 0 && filteredUserOptions.length === 0 && (
                      <p className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                        No registered user matches that search.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
            {!userOptionsLoading && userOptions.length === 0 && (
              <p className="text-xs font-semibold text-muted-foreground">
                No opposite-gender users are available to tag yet.
              </p>
            )}
          </div>

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
            className="h-10 w-full min-w-0 overflow-hidden rounded-full gap-2 px-4"
          >
            {locLoading ? (
              <Loader2 className="size-4 shrink-0 animate-spin" />
            ) : (
              <MapPin className="size-4 shrink-0" />
            )}
            <span className="min-w-0 truncate">
              {loc
                ? (loc.label ?? `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`)
                : "Tag photo location"}
            </span>
          </Button>

          <div className="border-y border-border py-3">
            <button
              type="button"
              onClick={toggleGuidelines}
              aria-expanded={guidelinesExpanded}
              className="flex w-full items-center justify-between gap-3 rounded-2xl px-1 py-2 text-left text-primary"
            >
              <span className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <ShieldCheck className="size-4" />
                </span>
                <span>
                  <span className="block text-xs font-black uppercase">Community Guidelines</span>
                  <span className="mt-1 block text-sm font-semibold text-foreground">
                    Open and read before posting.
                  </span>
                </span>
              </span>
              <ChevronDown
                className={`size-5 shrink-0 transition-transform ${
                  guidelinesExpanded ? "rotate-180" : ""
                }`}
              />
            </button>

            {guidelinesExpanded && <CommunityGuidelinesList compact className="mt-2" />}
          </div>

          <label
            className={`flex items-start gap-3 rounded-2xl border-2 p-4 ${
              guidelinesOpened
                ? "cursor-pointer border-primary bg-primary/10"
                : "cursor-not-allowed border-border bg-muted/60 opacity-70"
            }`}
          >
            <Checkbox
              checked={guidelinesAgreed}
              disabled={!guidelinesOpened}
              onCheckedChange={(value) => setGuidelinesAgreed(value === true)}
              className="mt-1 size-5"
              aria-label="Agree to follow the Community Guidelines for this post"
            />
            <span>
              <span className="text-lg font-black uppercase leading-tight text-primary">
                I agree to follow the Community Guidelines for this post
              </span>
              <span className="mt-2 block text-sm font-semibold text-foreground">
                {guidelinesOpened
                  ? "This post is factual, private, respectful, clean, and only about adults."
                  : "Open the guidelines above before checking this."}
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border-2 border-primary bg-primary/10 p-4 cursor-pointer">
            <Checkbox
              checked={privacyAgreed}
              onCheckedChange={(value) => setPrivacyAgreed(value === true)}
              className="mt-1 size-5"
              aria-label="Agree to public place and privacy rights statement"
            />
            <span className="text-lg font-black uppercase leading-tight text-primary">
              I agree that this photo is appropriate to post and I am not violating any privacy
              rights of the tagged user
            </span>
          </label>

          <Button
            onClick={handleUpload}
            disabled={
              !file ||
              !targetUserId ||
              !privacyAgreed ||
              !guidelinesOpened ||
              !guidelinesAgreed ||
              loading
            }
            className="w-full rounded-full h-11 font-semibold"
          >
            {loading ? "Posting…" : "Post it"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
