// Shared app state and navigation. main.js sets state.render.
export const state = { me: null, view: 'events', eid: null, render: () => {} };
export const go = (view, eid = null) => { state.view = view; state.eid = eid; state.render(); };
// Make any [data-go="view"] (+ optional data-id) element navigate on click.
export const wireNav = root => root.querySelectorAll('[data-go]').forEach(el => {
  el.onclick = () => go(el.dataset.go, el.dataset.id ? +el.dataset.id : null);
});
