import { App } from "obsidian";
import {
    EditorView,
    WidgetType,
    Decoration,
    ViewUpdate,
    ViewPlugin,
    DecorationSet,
    PluginValue,
    Range,
} from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import { TransformedCachedItem } from "./types";
import { createCounter } from "./view";
import BlockRefCounter from "./main";
import { createRefTableElement, createSearchElement } from "./view";
import { getSettings } from "./settings";

class ButtonWidget extends WidgetType {
    constructor(
        public readonly count: number,
        public readonly block: TransformedCachedItem
    ) {
        super();
    }

    toDOM() {
        const countEl = createCounter(this.block, this.count);
        return countEl;
    }

    ignoreEvent() {
        return false;
    }
}

function buttons(plugin: BlockRefCounter, view: EditorView) {
    const buttons = plugin.createPreview(plugin);
    const note = plugin.app.workspace.getActiveFile().basename;
    let widgets: Range<Decoration>[] = [];
    for (const { from, to } of view.visibleRanges) {
        for (const button of buttons) {
            if (
                button.block.pos.start.offset >= from &&
                button.block.pos.end.offset <= to &&
                button.block.references &&
                button.block.references.length > 0 &&
                button.block.page === note
            ) {
                const deco = Decoration.widget({
                    widget: new ButtonWidget(
                        button.block?.references.length,
                        button.block
                    ),
                });
                widgets.push(deco.range(button.block.pos.end.offset));
            }
        }
    }
    widgets = widgets.sort((a, b) => a.from - b.from).reduce((acc, widget) => {
        if (acc.length === 0) {
            return [widget];
        }
        const last = acc[acc.length - 1];
        if (last.from === widget.from) {
            return acc;
        }
        return [...acc, widget];
    }, []);
    return Decoration.set(widgets);
}

export function blockRefCounterPlugin(
    plugin: BlockRefCounter
): ViewPlugin<PluginValue> {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;
            effects: StateEffect<unknown>[] = [];

            constructor(view: EditorView) {
                this.decorations = buttons(plugin, view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = buttons(plugin, update.view);
                }
            }
        },
        {
            decorations: (v) => v.decorations,
            eventHandlers: {
                mousedown: (e, view) => {
                    const target = e.target as HTMLElement;
                    if (target.classList.contains("block-ref-count")) {
                        const id = target.dataset.blockRefId;
                        const block = plugin.buttons.filter(
                            (button) => button.block.key === id
                        )[0].block;
                        const pos = view.posAtDOM(target);
                        const effects: StateEffect<unknown>[] = [
                            addReferences.of({
                                to: pos,
                                app: plugin.app,
                                block,
                            }),
                        ];
                        if (!view.state.field(referencesField, false)) {
                            effects.push(
                                StateEffect.appendConfig.of(referencesField)
                            );
                        }
                        view.dispatch({ effects });
                    }
                },
            },
        }
    );
}

class referencesWidget extends WidgetType {
    constructor(public app: App, public block: TransformedCachedItem) {
        super();
    }

    toDOM() {
        const val = document.createElement("div");
        const { tableType } = getSettings();
        if (tableType === "basic") {
            createRefTableElement(this.app, this.block, val);
        }
        if (tableType === "search") {
            createSearchElement(this.app, this.block, val);
        }
        return val;
    }
}

const referencesDecoration = (app: App, block: TransformedCachedItem) => {
    return Decoration.widget({
        widget: new referencesWidget(app, block),
        side: 2,
        block: true,
    });
};

const addReferences = StateEffect.define<{
    to: number;
    app: App;
    block: TransformedCachedItem;
}>();

export const referencesField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(references, tr) {
        let exists = false;
        references = references.map(tr.changes);
        for (const e of tr.effects)
            if (e.is(addReferences)) {
                references = references.update({
                    filter: (_from, to) => {
                        if (to === e.value.to) {
                            exists = true;
                        }
                        return to !== e.value.to;
                    },
                });
                if (!exists) {
                    references = references.update({
                        add: [
                            referencesDecoration(
                                e.value.app,
                                e.value.block
                            ).range(e.value.to),
                        ],
                    });
                }
            }

        return references;
    },
    provide: (f) => EditorView.decorations.from(f),
});
