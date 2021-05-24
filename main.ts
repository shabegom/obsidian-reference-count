import { Plugin, BlockCache } from "obsidian";

export default class BlockRefCounter extends Plugin {
  async onload() {
    console.log("loading plugin");
    this.registerMarkdownPostProcessor((val, ctx) => {
      const { blocks } = this.app.metadataCache.getCache(ctx.sourcePath);
      const sectionLine = ctx.getSectionInfo(val).lineStart;
      if (blocks) {
        let parentBlocks: BlockCache[] = [];
        for (const id in blocks) {
          if (blocks[id].path === ctx.sourcePath) {
            parentBlocks.push(blocks[id]);
          }
        }
        parentBlocks.forEach((parentBlock) => {
          let count = 0;
          const files = this.app.vault.getMarkdownFiles();
          files.forEach((file) => {
            if (file.path !== ctx.sourcePath) {
              const { embeds, links } = this.app.metadataCache.getFileCache(
                file
              );
              if (embeds) {
                embeds.forEach((embed) => {
                  const id = embed.link.split("^")[1];
                  if (id === parentBlock.id) {
                    count++;
                  }
                });
              }
              if (links) {
                links.forEach((link) => {
                  const id = link.link.split("^")[1];
                  if (id === parentBlock.id) {
                    count++;
                  }
                });
              }
            }
          });
          if (count > 0 && parentBlock.position.start.line === sectionLine) {
            const countEl = createEl("button", { cls: "count" });
            countEl.innerText = count.toString();
            countEl.on("click", "button", () => {
              const search = this.app.workspace.getLeavesOfType("search")[0];
              search.view.setCollapseAll(false);
              search.view.setQuery(parentBlock.id + "]]");
              this.app.workspace.revealLeaf(search);
            });
            val.appendChild(countEl);
          }
        });
      }
    });
  }

  onunload() {
    console.log("unloading plugin");
  }
}
