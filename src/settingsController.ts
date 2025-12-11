import * as vscode from 'vscode';

type SettingValue = unknown;

interface SettingSnapshot {
	quickSuggestions: SettingValue;
}

interface TargetContext {
	config: vscode.WorkspaceConfiguration;
	target: vscode.ConfigurationTarget;
	key: string;
}

export class SuggestionSettingsController {
	private static readonly SNAPSHOT_KEY = 'c75.jsxContextSuggestions.snapshots';

	private readonly snapshots = new Map<string, SettingSnapshot>();
	private readonly state = new Map<string, 'enabled' | 'disabled'>();
	private readonly persisted: Map<string, SettingSnapshot>;

	constructor(private readonly memento: vscode.Memento) {
		this.persisted = this.loadPersisted();
	}

	public async restorePersisted(): Promise<void> {
		for (const [key, snapshot] of this.persisted.entries()) {
			await this.restoreByKey(key, snapshot);
		}

		this.persisted.clear();
		await this.savePersisted();
		await this.ensureDefaultsIfForcedOff();
	}

	public async disableFor(document: vscode.TextDocument): Promise<void> {
		const { config, target, key } = this.getTargetContext(document);

		if (this.state.get(key) === 'disabled') {
			return;
		}

		const snapshot: SettingSnapshot = {
			quickSuggestions: config.get('editor.quickSuggestions'),
		};

		this.snapshots.set(key, snapshot);
		this.persisted.set(key, snapshot);
		await this.savePersisted();
		this.state.set(key, 'disabled');

		await config.update('editor.quickSuggestions', false, target);
	}

	public async restore(document: vscode.TextDocument): Promise<void> {
		const { config, target, key } = this.getTargetContext(document);

		if (this.state.get(key) !== 'disabled') {
			return;
		}

		const snapshot = this.snapshots.get(key);

		if (snapshot) {
			await config.update('editor.quickSuggestions', snapshot.quickSuggestions, target);
			this.persisted.delete(key);
			await this.savePersisted();
		}

		this.state.set(key, 'enabled');
		this.snapshots.delete(key);
	}

	public async restoreAll(): Promise<void> {
		const entries = [...this.snapshots.entries()];
		this.snapshots.clear();
		this.state.clear();

		await Promise.all(entries.map(([key, snapshot]) => this.restoreByKey(key, snapshot)));
	}

	private async restoreByKey(key: string, snapshot: SettingSnapshot): Promise<void> {
		const { config, target } = this.getContextByKey(key);
		await config.update('editor.quickSuggestions', snapshot.quickSuggestions, target);
	}

	private getTargetContext(document: vscode.TextDocument): TargetContext {
		const resource = document.uri;
		const folder = vscode.workspace.getWorkspaceFolder(resource);

		const target = folder ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Workspace;
		const key = folder ? folder.uri.toString() : 'workspace';
		const config = vscode.workspace.getConfiguration(undefined, resource);

		return { config, target, key };
	}

	private getContextByKey(key: string): TargetContext {
		const folder = vscode.workspace.workspaceFolders?.find((item) => item.uri.toString() === key);
		const resource = folder?.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file('');
		const target = folder ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Workspace;
		const config = vscode.workspace.getConfiguration(undefined, resource);

		return { config, target, key };
	}

	private loadPersisted(): Map<string, SettingSnapshot> {
		const raw = this.memento.get<[string, SettingSnapshot][]>(SuggestionSettingsController.SNAPSHOT_KEY, []);
		return new Map(raw);
	}

	private async savePersisted(): Promise<void> {
		const entries = [...this.persisted.entries()];
		await this.memento.update(SuggestionSettingsController.SNAPSHOT_KEY, entries);
	}

	private async ensureDefaultsIfForcedOff(): Promise<void> {
		const keys = vscode.workspace.workspaceFolders?.map((f) => f.uri.toString()) ?? [];
		keys.push('workspace');

		for (const key of keys) {
			if (this.persisted.has(key)) {
				continue;
			}

			const { config, target } = this.getContextByKey(key);
			const quick = config.get('editor.quickSuggestions');

			if (quick === false) {
				await config.update('editor.quickSuggestions', undefined, target);
			}
		}
	}
}
