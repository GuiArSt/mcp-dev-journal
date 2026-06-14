import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const locale = process.argv[2] === 'fr' ? 'fr' : 'de';
const htmlFile = locale === 'fr' ? 'cv-fr.html' : 'cv.html';
const pdfFile =
  locale === 'fr'
    ? 'Guillermo_Arce_Stumpf_CV_FR.pdf'
    : 'Guillermo_Arce_Stumpf_CV.pdf';

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

await page.goto(`file://${join(__dirname, htmlFile)}`, {
  waitUntil: 'networkidle0',
});

await page.pdf({
  path: join(__dirname, pdfFile),
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});

await browser.close();
console.log(`PDF generated: cv/${pdfFile}`);
