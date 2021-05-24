import { Plugin, BlockCache, WorkspaceLeaf } from "obsidian";
declare module "obsidian" {
  interface View {
    setCollapseAll(collapse: boolean): void;
    setQuery(queryStr: string): void;
  }
}

export default class BlockRefCounter extends Plugin {
  async onload() {
    console.log("loading plugin: Block Reference Counter");
    this.registerMarkdownPostProcessor((val, ctx) => {
      const files = this.app.vault.getMarkdownFiles();
      const blocks = this.app.metadataCache.getCache(ctx.sourcePath).blocks;
      if (blocks) {
        const sectInfo = ctx.getSectionInfo(val);
        const lnStart = sectInfo.lineStart;
        const lnEnd = sectInfo.lineEnd;
        Object.values(blocks).forEach((eachBlock) => {
          const blockStart = eachBlock.position.start.line;
          const blockEnd = eachBlock.position.end.line;
          if (blockStart >= lnStart && blockEnd <= lnEnd) {
            //console.log(this.app.metadataCache.getCache(ctx.sourcePath));
            //console.log(ctx.getSectionInfo(val));
            //console.log(blocks);
            let count = 0;
            files.forEach((eachFile) => {
              const { embeds, links } = this.app.metadataCache.getFileCache(eachFile);
              if (embeds) {
                const embedMatch = embeds.filter((embed) => {
                  if (embed.link.split("^")[1] === eachBlock.id) { return true }
                });
                count = count + embedMatch.length;
              }
              if (links) {
                const linkMatch = links.filter((link) => {
                  if (link.link.split("^")[1] === eachBlock.id) { return true }
                });
                count = count + linkMatch.length;
              }
            });
            if (count > 0) {
              const countEl = createEl("button", { cls: "count" });
              countEl.innerText = count.toString();
              countEl.on("click", "button", () => {
                const search: WorkspaceLeaf = this.app.workspace.getLeavesOfType("search")[0];
                search.view.setCollapseAll(false);
                search.view.setQuery(eachBlock.id + "]]");
                this.app.workspace.revealLeaf(search);
              });
              if (blockStart !== lnStart) {
                const botPos = (lnEnd - blockEnd) * 40;
                countEl.style.bottom = botPos + 'px';
              }
              val.appendChild(countEl);
            }
          }
        });
      }
    });
  }

  onunload() {
    console.log("unloading plugin: Block Reference Counter");
  }
}
