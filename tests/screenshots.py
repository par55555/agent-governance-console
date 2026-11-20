import asyncio, os, sys
from pathlib import Path
from playwright.async_api import async_playwright
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out'; OUT.mkdir(exist_ok=True)
BASE = os.environ.get('AGC_BASE', 'http://127.0.0.1:8765/index.html')
CHROME = os.environ.get('CHROME_PATH')
MOCK = (HERE / 'mockdb.js').read_text()
# Optional: if Google Fonts is blocked, unpack @fontsource packages here (npm pack @fontsource/source-serif-4 @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono)
FD = os.environ.get('AGC_FONTS', '')
FONTS={} if not FD else {'serif-400':FD+'fontsource-source-serif-4-5.3.1/package/files/source-serif-4-latin-400-normal.woff2',
 'serif-600':FD+'fontsource-source-serif-4-5.3.1/package/files/source-serif-4-latin-600-normal.woff2',
 'sans-400':FD+'fontsource-ibm-plex-sans-5.3.0/package/files/ibm-plex-sans-latin-400-normal.woff2',
 'sans-500':FD+'fontsource-ibm-plex-sans-5.3.0/package/files/ibm-plex-sans-latin-500-normal.woff2',
 'sans-600':FD+'fontsource-ibm-plex-sans-5.3.0/package/files/ibm-plex-sans-latin-600-normal.woff2',
 'mono-400':FD+'fontsource-ibm-plex-mono-5.3.0/package/files/ibm-plex-mono-latin-400-normal.woff2'}
FAM={'serif':'Source Serif 4','sans':'IBM Plex Sans','mono':'IBM Plex Mono'}
CSS=''.join("@font-face{font-family:'%s';font-weight:%s;font-style:normal;src:url(https://fonts.local/%s.woff2) format('woff2');}"%(FAM[k.split('-')[0]],k.split('-')[1],k) for k in FONTS)
tag=sys.argv[1] if len(sys.argv)>1 else 'r1'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**({'executable_path': CHROME} if CHROME else {}))
        errs=[]
        for w in (1440,1024):
            ctx = await b.new_context(viewport={'width':w,'height':900})
            await ctx.add_init_script(MOCK)
            if FONTS: await ctx.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=CSS))
            if FONTS: await ctx.route('https://fonts.local/**', lambda r: r.fulfill(status=200, content_type='font/woff2', body=open(FONTS[r.request.url.rsplit('/',1)[1][:-6]],'rb').read()))
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append('pageerror: '+str(e)))
            async def snap(name, full=False):
                await pg.wait_for_timeout(400); await pg.evaluate('document.fonts.ready')
                if full:
                    hgt = await pg.evaluate("Math.max(document.querySelector('#main').scrollHeight + 80, 900)")
                    await pg.set_viewport_size({'width': w, 'height': hgt}); await pg.wait_for_timeout(300)
                await pg.screenshot(path=str(OUT / f'{tag}_{w}_{name}.png'))
                if full: await pg.set_viewport_size({'width': w, 'height': 900}); await pg.wait_for_timeout(200)
            await pg.goto(BASE+'#o2c'); await pg.wait_for_timeout(900)
            await snap('o2c_top')
            await snap('o2c_full', True)
            await pg.goto(BASE+'#all'); await snap('all_full', True)
            await pg.goto(BASE+'#r2r'); await snap('r2r_top')
            await pg.goto(BASE+'#agent-o2c-intake'); await snap('modal_overview')
            await pg.click('[data-tab="usage"]'); await snap('modal_usage')
            await pg.evaluate("document.querySelector('#modal .m-body, #modal [class*=body]') && (document.querySelector('#modal .m-body, #modal [class*=body]').scrollTop = 700)"); await snap('modal_usage2')
            await pg.click('[data-tab="spec"]'); await snap('modal_spec')
            await pg.keyboard.press('Escape'); await pg.goto(BASE+'#o2c'); await pg.wait_for_timeout(300)
            await pg.click('.sec-h [data-add]'); await snap('form')
            await ctx.close()
        print('\n'.join(errs) or 'no page errors')
        await b.close()
asyncio.run(main())
