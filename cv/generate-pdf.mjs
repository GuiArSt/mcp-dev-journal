import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

await page.goto(`file://${join(__dirname, 'cv.html')}`, { waitUntil: 'networkidle0' });

await page.pdf({
  path: join(__dirname, 'Guillermo_Arce_Stumpf_CV.pdf'),
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});

await browser.close();
console.log('PDF generated: cv/Guillermo_Arce_Stumpf_CV.pdf');
