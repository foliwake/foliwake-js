// Every story gets the site's own stylesheet, as every page does; each story module
// imports the stylesheets of its blocks (written by `foliwake blocks render`).
import '../styles/styles.css';

export default {
  parameters: { layout: 'padded' },
};
