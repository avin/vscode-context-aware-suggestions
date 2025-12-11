import * as ts from 'typescript';
import * as vscode from 'vscode';

const DEFAULT_CACHE_TTL_MS = 500;
const JSX_LANGUAGES = new Set([
	'javascriptreact',
	'typescriptreact',
	'javascript',
	'typescript',
]);

const MARKUP_LANGUAGES = new Set([
	'html',
	'xml',
	'xhtml',
	'svg',
]);

export interface JsxContextProbe {
	languageId: string;
	fileName: string;
	text: string;
	offset: number;
}

export class JsxContextDetector {
	private readonly cacheTtlMs: number;
	private cache?: {
		uri: string;
		version: number;
		position: vscode.Position;
		timestamp: number;
		result: boolean;
	};

	constructor(cacheTtlMs?: number, private readonly clock: () => number = Date.now) {
		this.cacheTtlMs = Math.max(0, cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
	}

	public isInsideJsxText(document: vscode.TextDocument, position: vscode.Position): boolean {
		if (!this.isSupported(document.languageId)) {
			return false;
		}

		if (MARKUP_LANGUAGES.has(document.languageId)) {
			return isMarkupTextContext({
				languageId: document.languageId,
				fileName: document.fileName,
				text: document.getText(),
				offset: document.offsetAt(position),
			});
		}

		if (this.isCacheValid(document, position)) {
			return this.cache!.result;
		}

		const result = isJsxTextContext({
			languageId: document.languageId,
			fileName: document.fileName,
			text: document.getText(),
			offset: document.offsetAt(position),
		});

		this.cache = {
			uri: document.uri.toString(),
			version: document.version,
			position,
			timestamp: this.clock(),
			result,
		};

		return result;
	}

	private isCacheValid(document: vscode.TextDocument, position: vscode.Position): boolean {
		if (!this.cache) {
			return false;
		}

		if (this.cache.uri !== document.uri.toString()) {
			return false;
		}

		if (this.cache.version !== document.version) {
			return false;
		}

		if (!this.cache.position.isEqual(position)) {
			return false;
		}

		if (this.cacheTtlMs === 0) {
			return false;
		}

		return this.clock() - this.cache.timestamp < this.cacheTtlMs;
	}

	private isSupported(languageId: string): boolean {
		return JSX_LANGUAGES.has(languageId) || MARKUP_LANGUAGES.has(languageId);
	}
}

export function isJsxTextContext(probe: JsxContextProbe): boolean {
	if (MARKUP_LANGUAGES.has(probe.languageId)) {
		return isMarkupTextContext(probe);
	}

	if (probe.offset < 0 || probe.offset > probe.text.length) {
		return false;
	}

	const sourceFile = ts.createSourceFile(
		probe.fileName,
		probe.text,
		ts.ScriptTarget.Latest,
		true,
		toScriptKind(probe.languageId),
	);

	if (!containsJsx(sourceFile)) {
		return false;
	}

	const targetNode = findDeepestNode(sourceFile, probe.offset);

	if (!targetNode) {
		return false;
	}

	if (isInsideJsxAttributeArea(targetNode, probe.offset)) {
		return false;
	}

	if (isInsideJsxExpressionContext(targetNode, probe.offset)) {
		return false;
	}

	if (isInsideJsxText(targetNode, probe.offset)) {
		return true;
	}

	return isInsideJsxGap(targetNode, probe.offset);
}

function findDeepestNode(node: ts.Node, offset: number): ts.Node | undefined {
	if (offset < node.getFullStart() || offset >= node.getEnd()) {
		return undefined;
	}

	for (const child of node.getChildren()) {
		const insideChild = findDeepestNode(child, offset);

		if (insideChild) {
			return insideChild;
		}
	}

	return node;
}

function toScriptKind(languageId: string): ts.ScriptKind {
	if (languageId === 'typescriptreact') {
		return ts.ScriptKind.TSX;
	}

	if (languageId === 'javascriptreact') {
		return ts.ScriptKind.JSX;
	}

	if (languageId === 'typescript') {
		return ts.ScriptKind.TSX;
	}

	return ts.ScriptKind.JSX;
}

function isInsideJsxGap(node: ts.Node, offset: number): boolean {
	let current: ts.Node | undefined = node;

	while (current) {
		if (ts.isJsxElement(current)) {
			const { openingElement, closingElement } = current;
			if (offset >= openingElement.getEnd() && offset <= closingElement.getStart()) {
				return true;
			}
		} else if (ts.isJsxFragment(current)) {
			const { openingFragment, closingFragment } = current;
			if (offset >= openingFragment.getEnd() && offset <= closingFragment.getStart()) {
				return true;
			}
		}

		current = current.parent;
	}

	return false;
}

function isInsideJsxText(node: ts.Node, offset: number): boolean {
	let current: ts.Node | undefined = node;

	while (current) {
		if (ts.isJsxText(current)) {
			return true;
		}

		if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current) || ts.isJsxOpeningFragment(current)) {
			if (offset > current.getStart() && offset < current.getEnd()) {
				return false;
			}
		}

		if (ts.isJsxClosingElement(current) || ts.isJsxClosingFragment(current)) {
			if (offset > current.getStart() && offset < current.getEnd()) {
				return false;
			}
		}

		current = current.parent;
	}

	return false;
}

function containsJsx(sourceFile: ts.SourceFile): boolean {
	let found = false;

	const visit = (node: ts.Node): void => {
		if (
			ts.isJsxElement(node) ||
			ts.isJsxFragment(node) ||
			ts.isJsxSelfClosingElement(node) ||
			ts.isJsxOpeningElement(node) ||
			ts.isJsxClosingElement(node) ||
			ts.isJsxOpeningFragment(node) ||
			ts.isJsxClosingFragment(node)
		) {
			found = true;
			return;
		}

		if (!found) {
			node.forEachChild(visit);
		}
	};

	visit(sourceFile);
	return found;
}

function isInsideJsxExpressionContext(node: ts.Node, offset: number): boolean {
	let current: ts.Node | undefined = node;

	while (current) {
		if (ts.isJsxExpression(current)) {
			if (offset > current.getStart() && offset < current.getEnd()) {
				return true;
			}
		}

		current = current.parent;
	}

	return false;
}

function isInsideJsxAttributeArea(node: ts.Node, offset: number): boolean {
	let current: ts.Node | undefined = node;

	while (current) {
		if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) {
			const { attributes } = current;
			if (offset >= attributes.getFullStart() && offset <= attributes.end) {
				return true;
			}

			// within tag name region after '<' and before '>'
			const tagStart = current.getStart();
			const tagEnd = attributes.getFullStart();
			if (offset > tagStart && offset < tagEnd) {
				return true;
			}
		}

		current = current.parent;
	}

	return isInsideTagAttributes(node.getSourceFile().getFullText(), offset);
}

function isMarkupTextContext(probe: JsxContextProbe): boolean {
	const { text, offset } = probe;

	if (offset < 0 || offset > text.length) {
		return false;
	}

	const lastGt = text.lastIndexOf('>', offset - 1);
	const lastLt = text.lastIndexOf('<', offset - 1);

	// Inside tag or before any tag
	if (lastLt > lastGt) {
		return false;
	}

	let nextLt = text.indexOf('<', offset);

	// No preceding '>' means not inside element body
	if (lastGt === -1) {
		return false;
	}

	// Skip HTML comments
	const commentStart = text.lastIndexOf('<!--', offset);
	if (commentStart !== -1 && commentStart > lastGt) {
		const commentEnd = text.indexOf('-->', commentStart);
		if (commentEnd === -1 || commentEnd >= offset) {
			return false;
		}
	}

	if (nextLt === -1) {
		nextLt = text.length;
	}

	return offset > lastGt && offset <= nextLt;
}

function isInsideTagAttributes(text: string, offset: number): boolean {
	const lastLt = text.lastIndexOf('<', offset);
	const lastGt = text.lastIndexOf('>', offset);

	if (lastLt === -1) {
		return false;
	}

	if (lastGt !== -1 && lastGt > lastLt) {
		return false;
	}

	const nextGt = text.indexOf('>', offset);

	if (nextGt === -1) {
		return false;
	}

	// Ignore closing tags
	if (text[lastLt + 1] === '/') {
		return false;
	}

	return lastLt < offset && offset < nextGt;
}
