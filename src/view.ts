import { App, Notice, WorkspaceLeaf } from "obsidian";
import { TransformedCachedItem, Link } from "./types";
import { getSettings } from "./settings";

export function createButtonElements(
    app: App,
    buttons: {
        block?: TransformedCachedItem;
        val?: HTMLElement;
    }[]
): void {
    buttons.forEach(({ block, val }) => {
        const count = block && block.references ? block.references.length : 0;
        const existingButton = val.querySelector("[data-count=count]");
        const countEl = createCounter(block, count);
        if (val) {
            const { tableType } = getSettings();

            if (tableType === "basic") {
                countEl.on("click", "button", () => {
                    createRefTableElement(app, block, val);
                });
            }
            if (tableType === "search") {
                countEl.on("click", "button", () => {
                    createSearchElement(app, block, val);
                });
            }
            if (existingButton) {
                existingButton.remove();
            }
            count > 0 && val.prepend(countEl);
        }
    });
}

export function createCounter(
    block: TransformedCachedItem,
    count: number
): HTMLElement {
    const countEl = createEl("button", { cls: "block-ref-count" });
    countEl.setAttribute("data-block-ref-id", block.key);
    countEl.setAttribute("data-count", "count");
    if (block.type === "link" || block.type === "list") {
        countEl.addClass("child-ref");
    } else {
        countEl.addClass("parent-ref");
    }
    countEl.innerText = count.toString();
    return countEl;
}

export function createRefTableElement(
    app: App,
    block: TransformedCachedItem,
    val: HTMLElement
): void {
    const refs = block.references ? block.references : undefined;
    const refTable: HTMLElement = createTable(app, refs);
    block.type === "block" && val.appendChild(refTable);
    block.type === "header" && val.appendChild(refTable);
    block.type === "link" && val.append(refTable);
    block.type.includes("list") && val.insertBefore(refTable, val.children[2]);
}

function buildSearchQuery(block: TransformedCachedItem): string {
    let page;
    let firstReference;
    let secondReference;

    if (block.type === "link" || block.type === "link-list") {
        if (block.key.includes("/")) {
            const keyArr = block.key.split("/");
            block.key = keyArr[keyArr.length - 1];
        }
        page = block.key;
        if (block.key.includes("#") && !block.key.includes("#^")) {
            page = block.key.split("#")[0];
            if (block.original) {
                firstReference = `/^#{1,6} ${regexEscape(block.original)}$/`;
            } else {
                firstReference = `/^#{1,6} ${regexEscape(
                    block.key.split("#")[1]
                )}/`;
            }
            secondReference = `/#${block.key.split("#")[1]}]]/`;
        }
        if (block.key.includes("#^")) {
            page = block.key.split("#^")[0];
            firstReference = `"^${block.key.split("#^")[1]}"`;
            if (block.key.includes("|")) {
                firstReference = `${firstReference.split("|")[0]}"`;
            }
            secondReference = `"#^${block.key.split("#^")[1]}"`;
        }
        if (!firstReference) {
            firstReference = "";
            secondReference = `"[[${block.key}]]"`;
        }
        if (block.key.includes("|")) {
            secondReference =
                secondReference + ` OR "${block.key.split("|")[0]}]]"`;
        } else {
            secondReference = secondReference + ` OR "[[${block.key}|"`;
        }
    }
    if (block.type === "header") {
        page = block.page;
        firstReference = `/^#{1,6} ${regexEscape(block.original)}$/`;
        secondReference = `/#${block.key}]]/`;
    }
    if (block.type === "block" || block.type === "block-list") {
        page = block.page;
        firstReference = `"^${block.key}"`;
        secondReference = `"${block.page}#^${block.key}"`;
    }
    return `(file:("${page}.md") ${firstReference}) OR (${secondReference}) `;
}

export async function createSearchElement(
    app: App,
    block: TransformedCachedItem,
    val: HTMLElement
): Promise<void> {
    const normalizedKey = normalize(block.key);
    const searchEnabled =
        app.internalPlugins.getPluginById("global-search").enabled;
    if (!searchEnabled) {
        new Notice("you need to enable the core search plugin");
    } else {
        const tempLeaf = app.workspace.getRightLeaf(false);
        //Hide the leaf/pane so it doesn't show up in the right sidebar
        tempLeaf.tabHeaderEl.hide();
        await tempLeaf.setViewState({
            type: "search-ref",
            state: {
                query: buildSearchQuery(block),
            },
        });
        const search = app.workspace.getLeavesOfType("search-ref");
        const searchElement = createSearch(search, block);
        const searchHeight = 300;
        searchElement.setAttribute("style", "height: " + searchHeight + "px;");

        if (!val.children.namedItem("search-ref")) {
            search[search.length - 1].view.searchQuery;
            // depending on the type of block the search view needs to be inserted into the DOM at different points
            block.type === "block" && val.appendChild(searchElement);
            block.type === "header" && val.appendChild(searchElement);
            block.type === "link" && val.append(searchElement);
            block.type.includes("list") &&
                val.insertBefore(searchElement, val.children[2]);
        } else {
            if (val.children.namedItem("search-ref")) {
                app.workspace.getLeavesOfType("search-ref").forEach((leaf) => {
                    const container = leaf.view.containerEl;
                    const dataKey = `[data-block-ref-id='${normalizedKey}']`;
                    const key = container.parentElement.querySelector(dataKey);
                    if (key) {
                        leaf.detach();
                    }
                });
            }
        }
    }
}

function createSearch(search: WorkspaceLeaf[], block: TransformedCachedItem) {
    const searchElement = search[search.length - 1].view.containerEl;
    const normalizedKey = normalize(block.key);
    searchElement.setAttribute("data-block-ref-id", normalizedKey);
    searchElement.setAttribute("id", "search-ref");
    return searchElement;
}

function createTable(app: App, refs: Link[]): HTMLElement {
    const refTable = createEl("table", { cls: "ref-table" });
    refTable.setAttribute("id", "ref-table");
    const noteHeaderRow = createEl("tr").createEl("th", { text: "Note" });

    const lineHeaderRow = createEl("tr").createEl("th", {
        text: "Reference",
        cls: "reference",
    });

    refTable.appendChild(noteHeaderRow);
    refTable.appendChild(lineHeaderRow);
    refs &&
        refs.forEach(async (ref) => {
            const lineContent = await app.vault
                .cachedRead(ref.sourceFile)
                .then(
                    (content) =>
                        content.split("\n")[ref.reference.position.start.line]
                );
            const row = createEl("tr");
            const noteCell = createEl("td");
            const lineCell = createEl("td");
            noteCell.createEl("a", {
                cls: "internal-link",
                href: ref.sourceFile.path,
                text: ref.sourceFile.basename,
            });

            lineCell.createEl("span", { text: lineContent });
            row.appendChild(noteCell);
            row.appendChild(lineCell);
            refTable.appendChild(row);
        });
    return refTable;
}

function regexEscape(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const normalize = (str: string) => {
    return str.replace(/\s+|'/g, "").toLowerCase();
};
