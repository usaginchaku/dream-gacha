(function(root){
  "use strict";
  function setValue(selector,value){const el=document.querySelector(selector);if(el)el.value=value??""}
  function resetNovelForm(){setValue("#novelTitle","");setValue("#novelBody","");setValue("#novelMemo","");const favorite=document.querySelector("#novelFavorite");if(favorite)favorite.checked=false;const count=document.querySelector("#novelBodyCount");if(count)count.textContent="0字"}
  root.DreamGachaUI={setValue,resetNovelForm};
})(typeof globalThis!=="undefined"?globalThis:this);
