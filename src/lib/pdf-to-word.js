import ConvertAPI from "convertapi";
import { Readable } from "stream";

/**
 * PDF -> Word (.docx) via ConvertAPI. Used ONLY for the pdf->docx path;
 * every other conversion stays on OnlyOffice.
 *
 * ConvertAPI has a real PDF-to-DOCX endpoint (with OCR for scanned PDFs),
 * unlike iLoveAPI whose `officepdf` tool only goes Office -> PDF.
 *
 * Requires in .env:
 *   CONVERTAPI_TOKEN   (API token from convertapi.com/a/auth)
 */

function client() {
  const token = process.env.CONVERTAPI_TOKEN;
  if (!token) {
    throw new Error("CONVERTAPI_TOKEN is not set in .env.");
  }
  // The SDK is a factory: ConvertAPI(token)
  return ConvertAPI(token);
}

/** First bytes tell us what a file really is, regardless of its name. */
function sniff(buf) {
  if (!buf || buf.length < 4) return "unknown";
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return "pdf"; // %PDF
  if (b[0] === 0x50 && b[1] === 0x4b) return "zip"; // PK.. (docx is a zip)
  return "other";
}

/**
 * Convert a PDF buffer to a DOCX buffer.
 * Returns a Buffer of the resulting .docx.
 */
export async function pdfToWord(buffer, filename = "document.pdf") {
  const api = client();

  // 1) upload the PDF bytes (wrap the buffer as a readable stream)
  const pdfName = filename.toLowerCase().endsWith(".pdf")
    ? filename
    : `${filename.replace(/\.[^.]+$/, "")}.pdf`;

  const stream = Readable.from(buffer);
  const uploaded = await api.upload(stream, pdfName);

  // 2) convert to docx (ConvertAPI applies OCR automatically for scans)
  const result = await api.convert("docx", { File: uploaded }, "pdf");

  const outFile = result.file;
  if (!outFile || !outFile.url) {
    throw new Error("ConvertAPI returned no output file.");
  }

  // 3) fetch the finished docx bytes from the result URL
  const res = await fetch(outFile.url);
  if (!res.ok) {
    throw new Error(`Could not download converted file (${res.status}).`);
  }
  const outBuf = Buffer.from(await res.arrayBuffer());

  // 4) sanity: a real .docx is a zip; refuse to save anything else
  const kind = sniff(outBuf);
  if (kind !== "zip") {
    throw new Error(`ConvertAPI returned a ${kind} file, not a Word document.`);
  }

  return outBuf;
}
