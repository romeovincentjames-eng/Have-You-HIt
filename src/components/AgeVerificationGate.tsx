import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AgeVerificationResult,
  isAtLeast18,
  parseAamvaBirthDate,
  parseDateInput,
  toDateInputValue,
} from "@/lib/age-verification";
import { CalendarCheck, IdCard, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";

type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorLike = {
  detect(image: ImageBitmapSource): Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

type BrowserWithBarcodeDetector = Window &
  typeof globalThis & {
    BarcodeDetector?: BarcodeDetectorConstructor;
  };

export function AgeVerificationGate({
  title = "Scan your ID",
  body = "Verify you are 18 or older before entering.",
  actionLabel = "Verify and continue",
  busy = false,
  onVerified,
  onBack,
  onSignOut,
}: {
  title?: string;
  body?: string;
  actionLabel?: string;
  busy?: boolean;
  onVerified: (result: AgeVerificationResult) => void;
  onBack?: () => void;
  onSignOut?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [idImageReady, setIdImageReady] = useState(false);
  const [fileName, setFileName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [barcodeMatched, setBarcodeMatched] = useState(false);
  const [scanMessage, setScanMessage] = useState("No ID scanned yet.");
  const [scanning, setScanning] = useState(false);
  const [confirmedOwnId, setConfirmedOwnId] = useState(false);

  const parsedBirthDate = useMemo(() => parseDateInput(birthDate), [birthDate]);
  const adult = parsedBirthDate ? isAtLeast18(parsedBirthDate) : false;
  const canVerify =
    idImageReady && parsedBirthDate && adult && confirmedOwnId && !busy && !scanning;

  async function scanIdImage(file: File) {
    setIdImageReady(true);
    setFileName(file.name);
    setBarcodeMatched(false);
    setScanMessage("Checking the ID image...");

    const detectorWindow = window as BrowserWithBarcodeDetector;

    if (!detectorWindow.BarcodeDetector || !window.createImageBitmap) {
      setScanMessage("Scanner unavailable here. Enter the birth date shown on the ID.");
      return;
    }

    setScanning(true);

    try {
      const bitmap = await createImageBitmap(file);
      const detector = new detectorWindow.BarcodeDetector({
        formats: ["pdf417", "qr_code", "aztec", "data_matrix"],
      });
      const codes = await detector.detect(bitmap);
      bitmap.close();

      const dateFromBarcode = codes
        .map((code) => (code.rawValue ? parseAamvaBirthDate(code.rawValue) : null))
        .find((date): date is Date => Boolean(date));

      if (!dateFromBarcode) {
        setScanMessage("ID image loaded. Enter the birth date shown on the ID.");
        return;
      }

      setBirthDate(toDateInputValue(dateFromBarcode));
      setBarcodeMatched(true);
      setScanMessage("ID barcode found. Birth date filled from the scan.");
    } catch {
      setScanMessage("ID image loaded. Enter the birth date shown on the ID.");
    } finally {
      setScanning(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void scanIdImage(file);
  }

  function verify() {
    if (!idImageReady) {
      toast.error("Scan or upload your ID first.");
      return;
    }

    if (!parsedBirthDate) {
      toast.error("Enter the birth date shown on the ID.");
      return;
    }

    if (!adult) {
      toast.error("You must be 18 or older to enter.");
      return;
    }

    if (!confirmedOwnId) {
      toast.error("Confirm this is your ID before continuing.");
      return;
    }

    onVerified({
      verifiedAt: new Date().toISOString(),
      method: barcodeMatched ? "id_barcode" : "id_image_and_birthdate",
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-3xl p-6 shadow-xl shadow-primary/5">
        <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
          <IdCard className="size-7" />
        </div>

        <h1 className="font-display text-3xl font-black mb-2">{title}</h1>
        <p className="text-muted-foreground mb-5">{body}</p>

        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy || scanning}
            className="w-full rounded-full h-12 gap-2 font-semibold"
          >
            {scanning ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Scan or upload ID
          </Button>

          <div className="rounded-2xl bg-muted/60 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {fileName || "No ID image selected"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{scanMessage}</p>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="birth-date">Birth date on ID</Label>
            <div className="relative mt-1">
              <CalendarCheck className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="birth-date"
                type="date"
                value={birthDate}
                onChange={(e) => {
                  setBirthDate(e.target.value);
                  setBarcodeMatched(false);
                }}
                className="pl-9"
              />
            </div>
            {parsedBirthDate && !adult && (
              <p className="mt-2 text-sm font-semibold text-destructive">
                This birth date is under 18.
              </p>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-2xl border-2 border-primary bg-primary/10 p-4 cursor-pointer">
            <Checkbox
              checked={confirmedOwnId}
              onCheckedChange={(value) => setConfirmedOwnId(value === true)}
              className="mt-1 size-5"
              aria-label="Confirm this is your ID"
            />
            <span>
              <span className="block text-lg font-black uppercase leading-tight text-primary">
                I confirm this is my ID
              </span>
              <span className="mt-1 block text-sm font-semibold text-foreground">
                I am the person on this ID and I am 18 years old or older.
              </span>
            </span>
          </label>

          <Button
            type="button"
            onClick={verify}
            disabled={!canVerify}
            className="w-full rounded-full h-12 font-semibold"
          >
            {busy ? "Saving..." : actionLabel}
          </Button>

          {onBack && (
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={busy || scanning}
              className="w-full rounded-full"
            >
              Back
            </Button>
          )}

          {onSignOut && (
            <button
              onClick={onSignOut}
              disabled={busy || scanning}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Not me - sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
