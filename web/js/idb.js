// Kulcs-érték tár (adatok, rajzok PDF-bájtjai). A megvalósítás közös: web/kozos/idb.js.
// Közös originen a Raktár is fut → saját adatbázisnév ('terep') és localStorage-előtag ('terep_').
import { createStore } from '../kozos/idb.js';

export const { get, set, del, keys } = createStore('terep', 'terep_');
