import { Plugin, Notice , App, PluginSettingTab, Setting, TFolder, Modal } from "obsidian";
import * as cheerio from "cheerio";

interface KindleHighlightsSettings {
	path: string;
}

const DEFAULT_SETTINGS: KindleHighlightsSettings = {
	path: "/",
};

export default class KindleHighlightsPlugin extends Plugin {
	settings: KindleHighlightsSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "openKindleHighlightsModal",
			name: "Import Highlights from HTML file",
			callback: () => {
				new FilePickerModal(this.app, (value) => {
					const reader = new FileReader();
					reader.onload = () => this.handleFileLoad(reader.result);
					reader.readAsText(value);
				}).open();
			},
		});

		this.addSettingTab(new KindleHighlightsSettingsTab(this.app, this));
	}

	async handleFileLoad(fileContents: string | ArrayBuffer | null) {
		if (!fileContents) return;

		const $ = cheerio.load(fileContents as string);
		const bookTitle = $(".bookTitle").text().trim().replace(/[\\/*<>:|?"]/g, "");
		const author = $(".authors").text().trim().replace(/[\\/*<>:|?"]/g, "");
		const publisher = $(".publisher").text().trim().replace(/[\\/*<>:|?"]/g, "");

		let content = "";
		let highlightsCounter = 0;

		$(".noteHeading").each((index, element) => {
			if ($(element).children("span").length !== 1) return;

			const pageMatch = $(element).text().match(/(Page|Location) (\d+)/);
			const pageNumber = pageMatch ? pageMatch[2] : null;
			const noteText = $(element).next(".noteText").text().trim();

			content += `${noteText}\n- ${pageMatch ? pageMatch[1] : ""} ${pageNumber || ""}\n\n`;

			if (
				$(element).next().next().children("span").length === 0 &&
				!$(element).next().next().hasClass("sectionHeading") &&
				$(element).next().next().length !== 0
			) {
				const userNote = $(element).next().next().next(".noteText").text().trim();
				content += `>[!${userNote}] \n\n`;
			}

			content += "---\n\n";
			highlightsCounter++;
		});

		const frontmatter = `---
título: "${bookTitle}"
autor: "${author}"
editorial: "${publisher}"
resaltados: ${highlightsCounter}
origen: Kindle
tags:
  - Kindle
  - ${author.replace(/\s+/g, "_")}
  - ${bookTitle.replace(/\s+/g, "_")}
fechaImportación: "${new Date().toISOString().split('T')[0]}"
---\n`;

		try {
			await this.app.vault.create(
				`${this.settings.path}/${bookTitle}.md`,
				`${frontmatter}\n\n## Highlights \n\n${content}`
			);
			new Notice("Archivo creado correctamente");
		} catch (error: any) {
			if (error.code === "ENOENT") {
				new Notice("Ruta inválida. Selecciona una carpeta válida en la configuración del plugin");
			} else {
				new Notice("El archivo ya existe");
			}
		}
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class FilePickerModal extends Modal {
	callback: (value: File) => void;

	constructor(app: App, callback: (value: File) => void){
		super(app);
		this.callback = callback;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h1", { text: "Importar resaltados desde archivo HTML" });
		contentEl.createEl("br");
		contentEl.createEl("p", { text: "Selecciona tu archivo HTML de Kindle:" });
		const input = contentEl.createEl("input", {
			type: "file",
			attr: { single: "" },
		});
		contentEl.createEl("br");
		contentEl.createEl("br");

		const button = contentEl.createEl("button", {
			text: "Importar resaltados",
		});
		button.addEventListener("click", () => {
			if (input.files) {
				const reader = new FileReader();
				reader.onload = () => this.callback(input.files![0]);
				reader.readAsText(input.files[0]);
				this.close();
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class KindleHighlightsSettingsTab extends PluginSettingTab {
	plugin: KindleHighlightsPlugin;

	constructor(app: App, plugin: KindleHighlightsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const folders: string[] = this.app.vault
			.getAllLoadedFiles()
			.filter((file) => file instanceof TFolder)
			.map((folderFile) => folderFile.path);

		new Setting(containerEl)
			.setName("Ruta de archivos")
			.setDesc("Selecciona la carpeta donde quieres guardar los resaltados")
			.addDropdown((dropdown) => {
				dropdown.addOptions({
					...folders.reduce((acc, cur) => ({ ...acc, [cur]: cur }), {}),
				});
				dropdown.setValue(this.plugin.settings.path);
				dropdown.onChange(async (value) => {
					this.plugin.settings.path = value;
					await this.plugin.saveSettings();
				});
			});
	}
}
