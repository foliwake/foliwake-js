// The default VitePress theme, plus the styles of the home page hero art
// and full-screen zoom for the diagrams.
import DefaultTheme from 'vitepress/theme';
import { useRoute } from 'vitepress';
import mediumZoom from 'medium-zoom';
import { nextTick, onMounted, watch } from 'vue';
import './custom.css';

// Images in the article body open full screen on click (a diagram can be too small to read inline).
// Esc, a second click or scrolling closes them. The logo and icons in the navigation are not affected.
const ZOOMABLE_IMAGES = '.vp-doc img';

let zoom = null;

function attachZoom() {
  zoom?.detach();
  zoom = mediumZoom(ZOOMABLE_IMAGES, { background: 'var(--vp-c-bg)', margin: 24 });
}

export default {
  extends: DefaultTheme,
  setup() {
    const route = useRoute();
    onMounted(attachZoom);
    // VitePress swaps pages without a reload: attach again to the new page's images.
    watch(
      () => route.path,
      () => nextTick(attachZoom),
    );
  },
};
