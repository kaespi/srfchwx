
var contentLoaded = 0;

window.addEventListener("load", function(event) {
    // send an empty message to the background script. This makes the toolbar-popup
    // being disabled (by default) and the context menu being removed (if it exists)
    if (!contentLoaded)
    {
        // only send this message once (otherwise already existing data could be
        // reset to zero)
        contentLoaded = 1;
        browser.runtime.sendMessage({});
    }
}, true);
window.addEventListener("beforeunload", function(event) {
    // send an empty message to the background script. This makes the toolbar-popup
    // being disabled (by default) and the context menu being removed (if it exists)
    browser.runtime.sendMessage({});
}, true);

window.addEventListener("mousedown", function(event) {
    // right click
    // (this will probably trigger the context menu to pop up)
    if (event.button == 2)
    {
        var idStr = '';
        
        // check if (right-) clicked on a link
        if (event.target && event.target.closest('a'))
        {
            // check if the "urn" data attribute is set, then we can easily extract the
            // media's ID from it
            var elemA = event.target.closest('a');
            if (elemA.dataset.urn)
            {
                idStr = elemA.dataset.urn;
            }
            else
            {
                // sometimes the ID is hidden somehow behind another node in the
                // DOM tree which is linked via the "href"-attribute. Check this option...
                var hrefAttr = elemA.getAttribute("href");
                if (hrefAttr && hrefAttr.substring(0,1)==="#")
                {
                    var promoId = hrefAttr.substring(1);
                    
                    // check if a node with this id exists
                    var promoNode = document.getElementById(promoId);
                    if (promoNode)
                    {
                        // check if any of the child elements there's the 'data-urn'
                        // attribute set
                        var promoChildren = promoNode.getElementsByTagName("*");
                        
                        for (var i=0; i<promoChildren.length; i++)
                        {
                            if(promoChildren[i].dataset && promoChildren[i].dataset.urn)
                            {
                                idStr = promoChildren[i].dataset.urn;
                                break;
                            }
                        }
                    }
                }
            
                // if we didn't find the "urn" data attribute yet, then we can try to extract
                // the ID from the "href" attribute of the link node. To do so, try to find
                // the ID using a regex
                if (idStr=='' && hrefAttr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/))
                {
                    idStr = hrefAttr;
                }
            }
        }
        
        // if the string with the ID was set then we can forward this information (via a
        // message) to the background script which can then do the actual extraction of
        // the URLs
        browser.runtime.sendMessage({srfchId: idStr});
    }
}, true); 
