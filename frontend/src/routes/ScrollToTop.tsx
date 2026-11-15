import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** BrowserRouter keeps the previous scroll position, so each page change starts at the top. */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export default ScrollToTop;
