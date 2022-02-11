import { App, Setting, PluginSettingTab } from "obsidian";
import BlockRefCounter from "./main";

export interface BlockRefCountSettings {
    displayParent: boolean;
    displayChild: boolean;
    displayBlocks: boolean;
    displayHeadings: boolean;
    displayLinks: boolean;
    displayEmbeds: boolean;
    tableType: string;
    indexOnVaultOpen: boolean;
    indexOnFileOpen: boolean;
    indexOnFileChange: boolean;
    indexOnLayoutChange: boolean;
}

export const DEFAULT_SETTINGS: BlockRefCountSettings = {
    displayParent: true,
    displayChild: true,
    displayBlocks: true,
    displayHeadings: true,
    displayLinks: true,
    displayEmbeds: true,
    indexOnVaultOpen: true,
    indexOnFileOpen: true,
    indexOnFileChange: true,
    indexOnLayoutChange: true,
    tableType: "search",
};

let settings: BlockRefCountSettings = { ...DEFAULT_SETTINGS };

export const getSettings = (): BlockRefCountSettings => {
    return { ...settings };
};

export const updateSettings = (
    newSettings: Partial<BlockRefCountSettings>
): BlockRefCountSettings => {
    settings = { ...settings, ...newSettings };

    return getSettings();
};

export class BlockRefCountSettingTab extends PluginSettingTab {
    plugin: BlockRefCounter;

    constructor(app: App, plugin: BlockRefCounter) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl("h2", {
            text: "Block Reference Counter Settings",
        });


        containerEl.createEl("h3", {
            text: "What elements should references be displayed on?",
        });

        new Setting(containerEl)
            .setName("Display on Parents")
            .setDesc(
                "Display the count of block references on the parent block or header"
            )
            .addToggle((toggle) => {
                toggle.setValue(getSettings().displayParent);
                toggle.onChange(async (val) => {
                    updateSettings({ displayParent: val });
                    await this.plugin.saveSettings();
                });
            });
        new Setting(containerEl)
            .setName("Display on Children")
            .setDesc(
                "Display the count of block references on the child reference blocks"
            )
            .addToggle((toggle) => {
                toggle.setValue(getSettings().displayChild);
                toggle.onChange(async (val) => {
                    updateSettings({ displayChild: val });
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Display on Blocks")
            .setDesc("Display the count of block references on blocks")
            .addToggle((toggle) => {
                toggle.setValue(getSettings().displayBlocks);
                toggle.onChange(async (val) => {
                    updateSettings({ displayBlocks: val });
                    await this.plugin.saveSettings();
                });
            });
        new Setting(containerEl)
            .setName("Display on Headers")
            .setDesc("Display the count of block references on headers")
            .addToggle((toggle) => {
                toggle.setValue(getSettings().displayHeadings);
                toggle.onChange(async (val) => {
                    updateSettings({ displayHeadings: val });
                    await this.plugin.saveSettings();
                });
            });
        new Setting(containerEl)
            .setName("Display on Links")
            .setDesc("Display the count of block references on links")
            .addToggle((toggle) => {
                toggle.setValue(getSettings().displayLinks);
                toggle.onChange(async (val) => {
                    updateSettings({ displayLinks: val });
                    await this.plugin.saveSettings();
                });
            });
        new Setting(containerEl)
            .setName("Display on Embeds")
            .setDesc("Display the count of block references on Embeds")
            .addToggle((toggle) => {
                toggle.setValue(getSettings().displayEmbeds);
                toggle.onChange(async (val) => {
                    updateSettings({ displayEmbeds: val });
                    await this.plugin.saveSettings();
                });
            });

        containerEl.createEl("h3", {
            text: "When should new references be indexed?",
        });
        containerEl.createEl("p", {
            text: "If you are experieincing lag, try toggling these settings off. Reload your vault for these settings to apply",
        });

        new Setting(containerEl)
            .setName("File Open")
            .setDesc("Index new references when the file is opened")
            .addToggle((toggle) => {
                toggle.setValue(getSettings().indexOnFileOpen);
                toggle.onChange(async (val) => {
                    updateSettings({ indexOnFileOpen: val });
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("File Edited")
            .setDesc("Index new references when the file is edited")
            .addToggle((toggle) => {
                toggle.setValue(getSettings().indexOnFileChange);
                toggle.onChange(async (val) => {
                    updateSettings({ indexOnFileChange: val });
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Layout Changed")
            .setDesc("Index new references when the layout is changed")
            .addToggle((toggle) => {
                toggle.setValue(getSettings().indexOnLayoutChange);
                toggle.onChange(async (val) => {
                    updateSettings({ indexOnLayoutChange: val });
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName("Type of Reference Table")
            .setDesc(
                "Choose what type of table you'd like references displayed as."
            )
            .addDropdown((dropdown) => {
                const { tableType } = getSettings();
                dropdown.addOption("search", "Search Results Table");
                dropdown.addOption("basic", "Basic Table");
                dropdown.setValue(tableType);
                dropdown.onChange(async (val) => {
                    updateSettings({ tableType: val });
                    await this.plugin.saveSettings();
                });
            });
    }
}