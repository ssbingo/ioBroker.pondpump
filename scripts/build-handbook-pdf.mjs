/*
 * Render the beginner handbooks (doc/handbook/<lang>/manual.md) to PDF via md-to-pdf (Chromium).
 * Run locally (needs the Chromium system libraries) or, more reliably, in the "Handbook PDFs" CI
 * workflow which installs those libraries on the runner.
 */
import { mdToPdf } from "md-to-pdf";
import { readFile, writeFile } from "node:fs/promises";

const files = ["doc/handbook/en/manual.md", "doc/handbook/de/manual.md"];

// The two scientific research papers are appended to the German handbook as appendices 1 and 2
// (single source of truth in doc/research/ — no duplicated text in the manual).
const APPENDICES = [
    {
        title: "Anhang 1: Teichpumpen-Durchfluss nach Wassertemperatur und Wetter",
        file: "doc/research/teichpumpe-durchfluss-temperatur-wetter.md",
    },
    {
        title: "Anhang 2: Wassertemperaturen im Koiteich",
        file: "doc/research/wassertemperaturen-im-koiteich.md",
    },
];

/** Build the appended appendix markdown (each research paper, its own top-level title replaced). */
async function appendixMarkdown() {
    let out = "";
    for (const a of APPENDICES) {
        const body = (await readFile(a.file, "utf8")).replace(/^#\s.*\r?\n/, ""); // drop the paper's own H1
        out += `\n\n<div style="page-break-before:always"></div>\n\n# ${a.title}\n${body}\n`;
    }
    return out;
}

const footer =
    '<div style="width:100%;font-size:8px;color:#8aa0a6;text-align:center;padding:0 12mm;">' +
    'ioBroker.pondpump handbook &nbsp;·&nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span>' +
    "</div>";

const config = {
    stylesheet: ["doc/handbook/style.css"],
    document_title: "ioBroker.pondpump — Handbook",
    launch_options: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
    pdf_options: {
        format: "A4",
        margin: { top: "16mm", bottom: "20mm", left: "16mm", right: "16mm" },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: footer,
    },
};

for (const path of files) {
    const out = path.replace(/\.md$/, ".pdf");
    // The German handbook carries the two research papers as appendices; render it from content so the
    // appendix markdown can be appended. The English handbook is rendered from its file as before.
    let source;
    if (path.includes("/de/")) {
        source = { content: (await readFile(path, "utf8")) + (await appendixMarkdown()) };
    } else {
        source = { path };
    }
    const pdf = await mdToPdf(source, config);
    if (!pdf || !pdf.content) {
        throw new Error(`md-to-pdf produced no output for ${path}`);
    }
    await writeFile(out, pdf.content);
    console.log(`wrote ${out} (${pdf.content.length} bytes)`);
}
