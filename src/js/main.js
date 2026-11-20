window.addEventListener('hashchange',render);
window.addEventListener('focus',()=>{if(typeof poll==='function')poll()});
applyTheme();
boot();
