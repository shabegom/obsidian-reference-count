import { App, Setting, PluginSettingTab } from "obsidian"
import BlockRefCounter from "./main"

export interface BlockRefCountSettings {
    mySetting: string;
}

export const DEFAULT_SETTINGS: BlockRefCountSettings = {
    mySetting: "default"
}

export class BlockRefCountSettingTab extends PluginSettingTab {
    plugin: BlockRefCounter;

    constructor(app: App, plugin: BlockRefCounter) {
        super(app, plugin)
        this.plugin = plugin
    }

    display(): void {
        const { containerEl } = this

        containerEl.empty()

        containerEl.createEl("h2", { text: "Settings for my awesome plugin." })

        new Setting(containerEl)
            .setName("Setting #1")
            .setDesc("It's a secret")
            .addText(text => text
                .setPlaceholder("Enter your secret")
                .setValue("")
                .onChange(async (value) => {
                    console.log("Secret: " + value)
                    this.plugin.settings.mySetting = value
                    await this.plugin.saveSettings()
                }))
    }
}