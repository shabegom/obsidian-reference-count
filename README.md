# Obsidian Block Reference Counts
**By shabegom**

## Known Issues
There are some known problems with this plugin. I don't have time to address them. PRs welcome:  
- #49 People report that this plugin causes lag in their vault. It seems to impact vaults with a large amount of references. There are a couple of settings to try and reduce the amount of indexing that happens.
- #66 There is a report that using Absolute Path links and this plugin causes renaming links to break in a pretty bad way. **If you use Absolute Path links I would not use this plugin at this time**.  

![](img/readme.png)

Show the amount of references you have in:
- block references
- headings
- block reference links
- embeds

Click on the number to open a table with links to the note with the reference and the line the reference appears on.

There are settings if you want counts to show up on parents, or children, or both. You can also choose to see a basic table, or a fancier search-like view of references.

## Install

Now available in Community Plugins!

## Issues

If you run into a bug, please submit an issue. If you have any questions reach out to @shabegom on the obsidian Discord.

## Changelog

**0.3.0**
Major Rewrite!  
- Uses new method of generated block references that is 10x faster than previous approach!
- Should now support non-englished languages
- Should support relative and full path links and embeds
- Improved accuracy of the search results view
- More responsive in updating reference counts

**0.1.6**
- Released in Community Plugins! 🎉

**0.0.9**
- Cleanup search view on unload
- Hide the right sidebar tab

**0.0.8**
- New references view

**0.0.6**
- Initial release
