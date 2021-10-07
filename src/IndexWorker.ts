import {buildIndex, setPages} from "./indexer";

onmessage = (evt) => {
   const pages = buildIndex(evt.data.pages);
    postMessage({pages});
};