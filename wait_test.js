const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222', // Connect to the open browser if possible
  });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('localhost:8080'));
  if (page) {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    
    // Select wallnut (index 2)
    // Actually we can just trigger it here
    await page.evaluate(() => {
       const w = document.querySelectorAll('.seed-packet')[2];
       w.click();
       const ev = new MouseEvent('click', { clientX: 300, clientY: 200 }); // click somewhere on grid
       document.querySelector('#gameCanvas').dispatchEvent(ev);
    });
    
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log("no page found");
  }
  browser.disconnect();
})();
