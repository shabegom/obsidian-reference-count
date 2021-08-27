import { App, Setting, PluginSettingTab, } from "obsidian"
import BlockRefCounter from "./main"

export interface BlockRefCountSettings {
    displayParent: boolean
    displayChild: boolean
    tableType: string
}

export const DEFAULT_SETTINGS: BlockRefCountSettings = {
    displayParent: true,
    displayChild: true,
    tableType: "search"
}

let settings: BlockRefCountSettings = { ...DEFAULT_SETTINGS }

export const getSettings = (): BlockRefCountSettings => {
    return { ...settings }
}

export const updateSettings = (newSettings: Partial<BlockRefCountSettings>): BlockRefCountSettings => {
    settings = { ...settings, ...newSettings }

    return getSettings()
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

        containerEl.createEl("h2", { text: "Block Reference Counter Settings" })

        new Setting(containerEl)
            .setName("Display on Parents")
            .setDesc("Display the count of block references on the parent block or header")
            .addToggle((toggle) => {
                toggle.setValue(getSettings().displayParent)
                toggle.onChange(async (val) => {
                    updateSettings({displayParent: val})
                    await this.plugin.saveSettings()
                })
            })
        new Setting(containerEl)
            .setName("Display on Children")
            .setDesc("Display the count of block references on the child reference blocks")
            .addToggle((toggle) => {
                toggle.setValue(getSettings().displayChild)
                toggle.onChange(async (val) => {
                    updateSettings({displayChild: val})
                    await this.plugin.saveSettings()
                })
            })
        new Setting(containerEl)
            .setName("Type of Reference Table")
            .setDesc("Choose what type of table you'd like references displayed as.")
            .addDropdown((dropdown) => {
                dropdown.setValue(getSettings().tableType)
                dropdown.addOption("choose", "Choose a Table Type")
                dropdown.addOption("search", "Search Results Table")
                dropdown.addOption("basic", "Basic Table")
                dropdown.onChange(async (val) => {
                    if (val === "search" || val === "basic") {
                        updateSettings({tableType: val})
                        await this.plugin.saveSettings()
                    }
                })
            })
    }
}