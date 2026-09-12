(function(root){
  "use strict";
  root.DreamGachaData=Object.freeze({
    SETTINGS_KEY:"dreamGachaSettings",
    SETTINGS_VERSION:42,
    BACKUP_SCHEMA:"dream-gacha.full-backup",
    BACKUP_VERSION:3,
    SNAPSHOT_KEYS:Object.freeze(["relationship","situation","mood","extra"]),
    CARD_KEYS:Object.freeze(["character","relationship","situation","mood","extra"]),
    NOVEL_PREVIEW_LENGTH:320
  });
  if(typeof module!=="undefined"&&module.exports)module.exports=root.DreamGachaData;
})(typeof globalThis!=="undefined"?globalThis:this);
