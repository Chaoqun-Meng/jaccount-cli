import { promises as fs } from "node:fs";
import jsQRModule from "jsqr";
import { PNG } from "pngjs";
import qrcode from "qrcode-terminal";

type JsQrDecode = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" }
) => { data: string } | null;

const jsQR = jsQRModule as unknown as JsQrDecode;

export type TerminalQrResult = {
  displayed: boolean;
  decoded: boolean;
  reason?: string;
};

export async function writeQrPngToStderr(args: {
  imagePath: string;
  enabled: boolean;
  stderr?: NodeJS.WriteStream;
}): Promise<TerminalQrResult> {
  if (!args.enabled) {
    return { displayed: false, decoded: false, reason: "disabled" };
  }

  const payload = await decodeQrPng(args.imagePath);
  if (!payload) {
    return { displayed: false, decoded: false, reason: "qr-decode-failed" };
  }

  const rendered = renderTerminalQr(payload);
  const stderr = args.stderr ?? process.stderr;
  stderr.write("\n");
  stderr.write(rendered);
  if (!rendered.endsWith("\n")) {
    stderr.write("\n");
  }

  return { displayed: true, decoded: true };
}

export async function decodeQrPng(imagePath: string): Promise<string | null> {
  const buffer = await fs.readFile(imagePath);
  const image = PNG.sync.read(buffer);
  const clamped = new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  const code = jsQR(clamped, image.width, image.height, { inversionAttempts: "attemptBoth" });
  return code?.data || null;
}

export function renderTerminalQr(payload: string): string {
  let output = "";
  qrcode.generate(payload, { small: true }, (qr) => {
    output = qr;
  });

  return output;
}
