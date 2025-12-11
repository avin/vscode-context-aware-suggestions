import * as vscode from 'vscode';
import { JsxContextDetector } from './contextDetector';
import { SuggestionSettingsController } from './settingsController';

class SuggestionGate {
	private readonly detector: JsxContextDetector;
	private readonly settings: SuggestionSettingsController;
	private inDisabledZone = false;
	private inflight: Promise<void> = Promise.resolve();

	constructor(detector: JsxContextDetector, settings: SuggestionSettingsController) {
		this.detector = detector;
		this.settings = settings;
	}

	public initialize(context: vscode.ExtensionContext): void {
		const subscriptions = [
			vscode.window.onDidChangeTextEditorSelection((event) => this.handleEditorChange(event.textEditor, 'selection')),
			vscode.workspace.onDidChangeTextDocument((event) => this.handleDocumentChange(event)),
			vscode.window.onDidChangeActiveTextEditor((editor) => this.handleEditorChange(editor, 'activeEditor')),
			{ dispose: () => void this.settings.restoreAll() },
		];

		context.subscriptions.push(...subscriptions);
		this.handleEditorChange(vscode.window.activeTextEditor, 'startup');
	}

	private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
		const { document } = event;
		const activeEditor = vscode.window.activeTextEditor;

		if (activeEditor && activeEditor.document === document) {
			const skipForTab = event.contentChanges.some((change) => change.text === '\t');
			this.handleEditorChange(activeEditor, 'documentChange', skipForTab);
		}
	}

	private handleEditorChange(editor: vscode.TextEditor | undefined, _reason: string, skipHide = false): void {
		if (!editor) {
			return;
		}

		const insideJsxText = this.detector.isInsideJsxText(editor.document, editor.selection.active);

		if (insideJsxText && !skipHide) {
			this.applySettings(editor.document, true);
		} else if (!insideJsxText) {
			this.applySettings(editor.document, false);
		}
	}

	private applySettings(document: vscode.TextDocument, shouldDisable: boolean): void {
		this.inflight = this.inflight.then(async () => {
			if (shouldDisable && !this.inDisabledZone) {
				this.inDisabledZone = true;
				await this.settings.disableFor(document);
			} else if (!shouldDisable && this.inDisabledZone) {
				this.inDisabledZone = false;
				await this.settings.restore(document);
			}
		}).catch(() => {
			// swallow errors to avoid breaking the chain
		});
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const settings = new SuggestionSettingsController(context.workspaceState);
	void settings.restorePersisted();

	const config = vscode.workspace.getConfiguration();
	const cacheTtlMs = config.get<number>('jsxContextSuggestions.cacheTtlMs');

	const gate = new SuggestionGate(new JsxContextDetector(cacheTtlMs), settings);
	gate.initialize(context);
}

export function deactivate(): void {
	// settings are restored eagerly during transitions; no-op on deactivate
}
