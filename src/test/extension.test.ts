import * as assert from 'assert';
import { isJsxTextContext } from '../contextDetector';

suite('JSX context detection', () => {
	test('detects text content inside JSX element', () => {
		const result = isJsxTextContext(createProbe('<div>Hello |world</div>'));
		assert.strictEqual(result, true);
	});

	test('keeps suggestions inside props', () => {
		const result = isJsxTextContext(createProbe('<div className="|"></div>'));
		assert.strictEqual(result, false);
	});

	test('keeps suggestions inside expressions', () => {
		const result = isJsxTextContext(createProbe('<div>{value|}</div>'));
		assert.strictEqual(result, false);
	});

	test('blocks suggestions in nested JSX text', () => {
		const result = isJsxTextContext(createProbe('<div><span>hi |there</span></div>'));
		assert.strictEqual(result, true);
	});

	test('keeps suggestions inside JSX attribute name', () => {
		const result = isJsxTextContext(createProbe('<div cl|></div>'));
		assert.strictEqual(result, false);
	});

	test('keeps suggestions inside JSX attribute value', () => {
		const result = isJsxTextContext(createProbe('<div className="he|llo"></div>'));
		assert.strictEqual(result, false);
	});

	test('keeps suggestions inside JSX closing tag', () => {
		const result = isJsxTextContext(createProbe('<div></sp|an>'));
		assert.strictEqual(result, false);
	});

	test('keeps suggestions right after tag open', () => {
		const result = isJsxTextContext(createProbe('<di|v></div>'));
		assert.strictEqual(result, false);
	});

	test('keeps suggestions right before tag close', () => {
		const result = isJsxTextContext(createProbe('<div|></div>'));
		assert.strictEqual(result, false);
	});

	test('blocks suggestions in empty JSX text slot', () => {
		const result = isJsxTextContext(createProbe('<div><span>|</span></div>'));
		assert.strictEqual(result, true);
	});

	test('blocks suggestions between sibling JSX nodes', () => {
		const result = isJsxTextContext(createProbe('<div><a>foo</a>|<b>bar</b></div>'));
		assert.strictEqual(result, true);
	});

	test('blocks suggestions at start of text node', () => {
		const result = isJsxTextContext(createProbe('<div>|hello</div>'));
		assert.strictEqual(result, true);
	});

	test('allows suggestions in plain JavaScript', () => {
		const result = isJsxTextContext(createProbe('const value = |;', 'javascriptreact'));
		assert.strictEqual(result, false);
	});

	test('allows suggestions in TypeScript without JSX', () => {
		const result = isJsxTextContext(createProbe('function add(a: number, b: number) { return a + b + |; }', 'typescript'));
		assert.strictEqual(result, false);
	});

	test('ignores unsupported language', () => {
		const result = isJsxTextContext(createProbe('Just text |here', 'plaintext'));
		assert.strictEqual(result, false);
	});

	test('allows suggestions inside JSX comments', () => {
		const result = isJsxTextContext(createProbe('<div>{/* |comment */}</div>'));
		assert.strictEqual(result, false);
	});

	test('html: blocks suggestions inside text', () => {
		const result = isJsxTextContext(createProbe('<div>hello |world</div>', 'html'));
		assert.strictEqual(result, true);
	});

	test('html: keeps suggestions inside attribute', () => {
		const result = isJsxTextContext(createProbe('<div class="|value"></div>', 'html'));
		assert.strictEqual(result, false);
	});

	test('html: keeps suggestions inside comment', () => {
		const result = isJsxTextContext(createProbe('<div><!-- |comment --></div>', 'html'));
		assert.strictEqual(result, false);
	});

	test('html: keeps suggestions inside attribute value', () => {
		const result = isJsxTextContext(createProbe('<div class="val|ue"></div>', 'html'));
		assert.strictEqual(result, false);
	});

	test('html: keeps suggestions inside attribute name', () => {
		const result = isJsxTextContext(createProbe('<div da|ta-id="x"></div>', 'html'));
		assert.strictEqual(result, false);
	});

	test('html: keeps suggestions inside closing tag', () => {
		const result = isJsxTextContext(createProbe('<div>text</di|v>', 'html'));
		assert.strictEqual(result, false);
	});

	test('html: blocks suggestions between elements', () => {
		const result = isJsxTextContext(createProbe('<div><a>1</a>|<b>2</b></div>', 'html'));
		assert.strictEqual(result, true);
	});
});

function createProbe(input: string, languageId = 'typescriptreact') {
	const marker = input.indexOf('|');

	if (marker === -1) {
		throw new Error('Missing caret marker "|" in test input');
	}

	const text = input.slice(0, marker) + input.slice(marker + 1);

	return {
		languageId,
		fileName: 'virtual.tsx',
		text,
		offset: marker,
	};
}
