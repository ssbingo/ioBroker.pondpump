/*
 * Render the beginner handbooks (docs/handbook/<lang>/manual.md) to PDF via md-to-pdf (Chromium).
 * Run locally (needs the Chromium system libraries) or, more reliably, in the "Handbook PDFs" CI
 * workflow which installs those libraries on the runner.
 */
import { mdToPdf } from "md-to-pdf";
import { writeFile } from "node:fs/promises";

const files = ["docs/handbook/en/manual.md", "docs/handbook/de/manual.md"];

const footer =
    '<div style="width:100%;font-size:8px;color:#8aa0a6;text-align:center;padding:0 12mm;">' +
    'ioBroker.pondpump handbook &nbsp;·&nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span>' +
    "</div>";

const config = {
    stylesheet: ["docs/handbook/style.css"],
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
    const pdf = await mdToPdf({ path }, config);
    if (!pdf || !pdf.content) {
        throw new Error(`md-to-pdf produced no output for ${path}`);
    }
    await writeFile(out, pdf.content);
    console.log(`wrote ${out} (${pdf.content.length} bytes)`);
}
