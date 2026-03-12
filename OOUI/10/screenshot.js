(function() {
    'use strict';
    if (!document.querySelector('.iphone-frame')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'screenshotBtn';
    btn.className = 'screenshot-btn';
    btn.setAttribute('aria-label', 'スクリーンショットを撮影');
    btn.innerHTML = '<span class="material-icons" style="font-size:24px">photo_camera</span>';
    document.body.appendChild(btn);

    btn.addEventListener('click', function() {
        var frame = document.querySelector('.iphone-frame');
        if (!frame) return;

        function doCapture() {
            if (typeof html2canvas === 'undefined') {
                alert('スクリーンショット機能の読み込み中です。しばらく待ってから再度お試しください。');
                return;
            }
            html2canvas(frame, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#000'
            }).then(function(canvas) {
                var link = document.createElement('a');
                link.download = 'screenshot-' + (new Date().toISOString().slice(0,19).replace(/[:-]/g,'')) + '.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            }).catch(function(err) {
                console.error(err);
            });
        }

        doCapture();
    });
})();
