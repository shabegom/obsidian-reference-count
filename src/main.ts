import {
    App,
    EventRef,
    MarkdownView,
    debounce,
    Constructor,
    Plugin,
    WorkspaceLeaf,
    View,
} from "obsidian";
import { TransformedCache, TransformedCachedItem } from "./types";
import { buildLinksAndReferences, getCurrentPage } from "./indexer";
import {
    BlockRefCountSettingTab,
    BlockRefCountSettings,
    getSettings,
    updateSettings,
} from "./settings";
import { createPreviewView, processPage } from "./process";
import { blockRefCounterPlugin, referencesField } from "./livePreview";

/*
 * BlockRefCounter Plugin
 * by shabegom
 *
 * Iterates through the cache of all notes in a vault and creates an index of block-ids, headings, links referencing a block-id or heading, and embeds
 * Adds a button in Preview view with the count of references found
 * When button is clicked, reveals a table with links to each reference and line reference exists on
 */
export default class BlockRefCounter extends Plugin {
    public resolved: EventRef;
    public page: TransformedCache;
    public buttons: {
        block?: TransformedCachedItem;
        val?: HTMLElement;
    }[] = [];
    public createPreview = createPreviewView;
    public settings: BlockRefCountSettings;

    async onload(): Promise<void> {
        console.log("loading plugin: Block Reference Counter");
        await this.loadSettings();

        this.addSettingTab(new BlockRefCountSettingTab(this.app, this));

        const indexDebounce = debounce(
            () => {
                buildLinksAndReferences(this.app);
            },
            3000,
            true
        );
        const previewDebounce = debounce(
            () => {
                this.buttons = [];
                this.buttons = createPreviewView(this);
            },
            500,
            true
        );

        /**
         * Fire the initial indexing only if layoutReady = true
         * and if the metadataCache has been resolved for the first time
         * avoids trying to create an index while obsidian is indexing files
         */
        this.app.workspace.onLayoutReady(() => {
            this.settings = getSettings();
            unloadSearchViews(this.app);
            const resolved = this.app.metadataCache.on("resolved", () => {
                this.app.metadataCache.offref(resolved);
                if (this.settings.indexOnVaultOpen) {
                    buildLinksAndReferences(this.app);
                    this.buttons = createPreviewView(this);
                    const activeView = this.app.workspace.getActiveViewOfType(
                        MarkdownView as unknown as Constructor<View>
                    );
                    if (activeView) {
                        const file = activeView.file;
                        this.page = getCurrentPage({ file, app: this.app });
                    }
                }

                this.registerEvent(
                    this.app.vault.on("delete", () => {
                        indexDebounce();
                    })
                );

                this.registerEvent(
                    this.app.workspace.on("layout-change", () => {
                        if (this.settings.indexOnLayoutChange) {
                            indexDebounce();
                            previewDebounce();
                        }
                    })
                );

                this.registerEvent(
                    this.app.workspace.on("file-open", (file): void => {
                        if (this.settings.indexOnFileOpen) {
                            indexDebounce();
                            this.page = getCurrentPage({ file, app: this.app });
                            previewDebounce();
                        }
                    })
                );

                this.registerEvent(
                    this.app.metadataCache.on("resolve", (file) => {
                        if (this.settings.indexOnFileChange) {
                            indexDebounce();
                            this.page = getCurrentPage({ file, app: this.app });
                            previewDebounce();
                        }
                    })
                );
                this.registerEditorExtension([
                    blockRefCounterPlugin(this),
                    referencesField,
                ]);
            });
        });

        this.registerView("search-ref", (leaf: WorkspaceLeaf) => {
            if (!this.app.viewRegistry.getViewCreatorByType("search")) {
                return;
            }
            const newView: View =
                this.app.viewRegistry.getViewCreatorByType("search")(leaf);
            newView.getViewType = () => "search-ref";
            return newView;
        });

        //        *
        // Event listeners to re-index notes if the cache changes or a note is deleted
        // triggers creation of block ref buttons on the preview view

        this.registerMarkdownPostProcessor((el, ctx) => {
            const sectionInfo = ctx.getSectionInfo(el);
            const lineStart = sectionInfo && sectionInfo.lineStart;
            if (this.page && lineStart) {
                const processed = processPage(
                    this.page,
                    this.app,
                    el,
                    lineStart
                );
                if (processed.length > 0) {
                    const ids = this.buttons.map((button) => button.block.key);
                    processed.forEach((item) => {
                        if (!ids.includes(item.block.key)) {
                            this.buttons.push(item);
                        }
                    });
                }
            }
        });
    }

    onunload(): void {
        console.log("unloading plugin: Block Reference Counter");
        unloadButtons(this.app);
        unloadSearchViews(this.app);
    }
    async loadSettings(): Promise<void> {
        const newSettings = await this.loadData();
        updateSettings(newSettings);
    }
    async saveSettings(): Promise<void> {
        await this.saveData(getSettings());
    }
}

/**
 * if there are block reference buttons in the current view, remove them
 * used when the plugin is unloaded
 *
 * @param   {App}  app
 *
 * @return  {void}
 */
function unloadButtons(app: App): void {
    let buttons;
    const activeLeaf = app.workspace.getActiveViewOfType(
        MarkdownView as unknown as Constructor<View>
    );
    if (activeLeaf) {
        buttons = activeLeaf.containerEl.querySelectorAll("#count");
    }
    buttons && buttons.forEach((button: HTMLElement) => button.remove());
}

function unloadSearchViews(app: App): void {
    app.workspace
        .getLeavesOfType("search-ref")
        .forEach((leaf: WorkspaceLeaf) => leaf.detach());
}
