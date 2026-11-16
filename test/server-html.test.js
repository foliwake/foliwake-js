// @foliwake/server/html: the strict parse (the host app's HTML fragment cases) and the body policy (design §9.4).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkPlainBody, checkBody, componentNames, serialize, srcsetCandidates } from '@foliwake/server/html';

const refused = (html, pattern) => assert.throws(() => checkPlainBody(html, '/lessons/a'), (e) => e.name === 'FoliwakePageError' && e.kind === 'invalid' && (!pattern || pattern.test(e.message)), html);
const ok = (html) => assert.doesNotThrow(() => checkPlainBody(html, '/lessons/a'), html);

describe('strict parse (fail closed on every repair)', () => {
  test('well-formed serialiser output passes', () => {
    ok('<h1 id="t">Title</h1><p>Text &amp; more<br>line</p><img src="/media/x.png" alt="">');
    ok('<div data-component="question"><ul data-select=""><li data-option-id="a">A</li></ul></div>');
    ok('<!-- comment --><p>x</p>');
  });
  for (const [name, html] of [
    ['unclosed element', '<div><p>x</p>'],
    ['implied end tag', '<p>a<div>b</div></p>'],
    ['end tag without start', '<p>x</p></span>'],
    ['implied start tag', '</p>'],
    ['duplicate attribute', '<p class="a" class="b">x</p>'],
    ['cut-off start tag', '<p>x</p><img src="a"'],
    ['cut-off end tag', '<p>x</p></p'],
    ['unterminated comment', '<p>x</p><!-- open'],
    ['doctype', '<!DOCTYPE html><p>x</p>'],
  ]) test(`refused: ${name}`, () => refused(html));
  test('nesting deeper than 200 is refused', () => refused('<div>'.repeat(205) + '</div>'.repeat(205), /nested too deeply/));
});

describe('policy', () => {
  for (const el of ['script', 'style', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'noscript', 'template', 'svg', 'math', 'frameset', 'xmp', 'plaintext']) {
    const html = ['base', 'meta', 'link', 'embed'].includes(el) ? `<${el}>` : `<${el}></${el}>`;
    test(`<${el}> refused`, () => refused(html, new RegExp(`<${el}>`)));
  }
  test('<form> only as the question block writes it: explicit method="dialog", no way to submit elsewhere', () => {
    ok('<form data-field="question" data-correct="2" method="dialog"><label><input type="radio" name="q" value="1">A</label><button type="submit">Check</button></form>');
    ok('<form method="DIALOG"><input type="checkbox"></form>');
    ok('<form method="&#x64;ialog"><input type="checkbox"></form>'); // decodes to exactly "dialog"
    for (const html of [
      '<form><input type="checkbox"></form>',                                   // GET to the page itself
      '<form method="get">x</form>',
      '<form method="post">x</form>',
      '<form method="dialog" action="https://evil.example/">x</form>',
      '<form method="dialog" target="_blank">x</form>',
      '<form method="dialog" enctype="text/plain">x</form>',
      '<form method=" dialog "><input name="q"><button>x</button></form>',   // padded: invalid, so GET
      '<form method="dialog "><button>x</button></form>',
      '<form method="&#32;dialog"><button>x</button></form>',                 // entity-encoded space
      '<form method="dialog&#9;"><button>x</button></form>',
      '<form method="&#x64;ialog&#10;"><button>x</button></form>',
      '<form method=""><button>x</button></form>',
    ]) refused(html, /<form>/);
    for (const html of [
      '<form method="dialog"><button formmethod="post">x</button></form>',
      '<form method="dialog"><button formaction="/x">x</button></form>',
      '<form method="dialog"><input type="submit" formtarget="_blank"></form>',
      '<form method="dialog"><button formenctype="text/plain">x</button></form>',
      '<button form="other" type="submit">x</button>',
    ]) refused(html, /attribute/);
  });
  for (const [name, html] of [
    ['onclick', '<p onclick="x()">a</p>'],
    ['onerror uppercase', '<img src="/a.png" ONERROR="x()">'],
    ['style attribute', '<p style="color:red">a</p>'],
    ['srcdoc', '<p srcdoc="x">a</p>'],
    ['formaction', '<button formaction="/x">a</button>'],
    ['xmlns', '<p xmlns="x">a</p>'],
    ['is', '<p is="x-y">a</p>'],
    ['namespaced attribute', '<a xlink:href="javascript:x">a</a>'],
  ]) test(`attribute refused: ${name}`, () => refused(html, /attribute/));

  for (const [name, html] of [
    ['javascript: href', '<a href="javascript:alert(1)">a</a>'],
    ['entity-encoded javascript:', '<a href="&#106;avascript:alert(1)">a</a>'],
    ['tab inside the scheme', '<a href="java&#9;script:alert(1)">a</a>'],
    ['leading space', '<a href=" javascript:alert(1)">a</a>'],
    ['vbscript', '<a href="vbscript:x">a</a>'],
    ['scheme-relative host', '<img src="//evil.example/x.png">'],
    ['http image', '<img src="http://example.org/x.png">'],
    ['data: on a link', '<a href="data:text/html,x">a</a>'],
    ['data: svg image', '<img src="data:image/svg+xml,&lt;svg&gt;">'],
    ['data: png on a source element', '<video><source src="data:image/png;base64,AA"></video>'],
    ['mailto in src', '<img src="mailto:a@b">'],
    ['javascript in srcset', '<img src="/a.png" srcset="/a.png 1x, javascript:x 2x">'],
    ['bad srcset descriptor', '<img src="/a.png" srcset="/a.png 100px">'],
    ['javascript poster', '<video poster="javascript:x"></video>'],
    ['javascript cite', '<blockquote cite="javascript:x">q</blockquote>'],
  ]) test(`URL refused: ${name}`, () => refused(html));

  test('allowed URLs', () => {
    ok('<a href="/lessons/b">b</a><a href="b">rel</a><a href="#x">frag</a><a href="https://example.org/x">ext</a>');
    ok('<a href="mailto:a@example.org">m</a><a href="tel:+995">t</a>');
    ok('<img src="data:image/png;base64,AAAA" alt="">');
    ok('<img src="/media/a.png" srcset="https://m.example/cdn-cgi/image/width=480,format=auto,quality=80,metadata=none/media/a.png 480w, /media/a.png 2x" alt="">');
  });

  test('srcset: the URL ends at whitespace, so commas inside it are kept', () => {
    assert.deepEqual(srcsetCandidates('https://m/cdn-cgi/image/width=480,format=auto/a.png 480w, /b.png 2x,/c.png'), [
      { url: 'https://m/cdn-cgi/image/width=480,format=auto/a.png', descriptor: '480w' },
      { url: '/b.png', descriptor: '2x' },
      { url: '/c.png', descriptor: '' },
    ]);
  });

  test('component names are collected and checked', () => {
    assert.deepEqual(componentNames(checkBody('<div data-component="tap"></div><div data-component="question"></div><div data-component="tap"></div>')), ['question', 'tap']);
    refused('<div data-component="Bad Name"></div>', /component name/);
  });

  test('serialisation round-trips the checked tree (what the browser gets is what was checked)', () => {
    const html = '<p title="a &quot;q&quot; &amp; b">x &lt;y&gt; &amp;&nbsp;z</p><pre>\nkeep</pre><pre>\n\ntwo</pre><div/>';
    const out = serialize(checkBody(html));
    assert.equal(out, '<p title="a &quot;q&quot; &amp; b">x &lt;y&gt; &amp;&nbsp;z</p><pre>keep</pre><pre>\n\ntwo</pre><div></div>');
    assert.equal(serialize(checkBody(out)), out);
  });
});
