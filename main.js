// --- CẤU HÌNH ---
var CAR_IP = "http://192.168.4.1";
var BRAKE_STEP = 5; 
var BRAKE_RATE = 50;

// --- TRẠNG THÁI ---
var state = {
    angle: 0,
    speed: 0,
    headLight: false,
    reverse: false,
    cruise: false,
    braking: false,
    warning: false 
};

var brakeInterval = null;
var warningInterval = null; 

// --- HÀM GỬI LỆNH ---
function send(cmd) {
    console.log("CMD:", cmd);
    // fetch(CAR_IP + "/cmd?q=" + cmd).catch(function(e){});
}

// --- ÂM THANH BÍP ---
var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioCtx = new AudioContext();

function beep(duration, freq) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq || 1000;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    setTimeout(function() { osc.stop(); }, duration || 100);
}

// --- XỬ LÝ GIAO DIỆN & LOGIC ---

// 1. THANH GA
var slider = document.getElementById('throttleSlider');
var sliderThumb = document.getElementById('sliderThumb');
var speedText = document.getElementById('speedText');
var digitalSpeed = document.getElementById('digitalSpeed');

function syncSpeedUI(val) {
    state.speed = val;
    slider.value = val;
    if(sliderThumb) sliderThumb.style.bottom = val + "%";
    if(speedText) speedText.innerText = val + "%";
    if(digitalSpeed) digitalSpeed.innerText = Math.round(val * 0.5); 
    
    // Hiệu ứng đèn slider
    if(sliderThumb) {
        var light = sliderThumb.querySelector('.indicator-light');
        if(light) light.style.opacity = 0.5 + (val / 200);
    }

    send("SPEED=" + val);
    checkReverseSensor(); 
}

if(slider) {
    slider.addEventListener('input', function() { if(!state.braking) syncSpeedUI(slider.value); });
    var handleRelease = function() { if (!state.cruise && !state.braking) syncSpeedUI(0); };
    slider.addEventListener('touchend', handleRelease);
    slider.addEventListener('mouseup', handleRelease);
}


// 2. CHỨC NĂNG BẬT ĐÈN
function toggleFunc(type) {
    if (type === 'HEADLIGHT') {
        state.headLight = !state.headLight;
        var btnHead = document.getElementById('btnHeadLight');
        if(btnHead) {
            if(state.headLight) btnHead.classList.add('active');
            else btnHead.classList.remove('active');
        }
        send(state.headLight ? "HEAD_ON" : "HEAD_OFF");
    }
    else if (type === 'REV') {
        state.reverse = !state.reverse;
        var btnRev = document.getElementById('btnRev');
        if(btnRev) {
            if(state.reverse) btnRev.classList.add('active');
            else btnRev.classList.remove('active');
        }

        if(sliderThumb) {
            if(state.reverse) sliderThumb.classList.add('reverse');
            else sliderThumb.classList.remove('reverse');
        }
        
        var screenIdle = document.getElementById('screenIdle');
        var radarView = document.getElementById('radarView');
        if(screenIdle && radarView) {
            screenIdle.style.display = state.reverse ? 'none' : 'block';
            radarView.style.display = state.reverse ? 'flex' : 'none';
        }
        
        send(state.reverse ? "MODE_REV" : "MODE_FWD");
        checkReverseSensor();
    }
}


// 3. LOGIC CẢNH BÁO LÙI & PHANH KHẨN CẤP
function checkReverseSensor() {
    // Nếu xe dừng hoặc hết lùi -> Tắt cảnh báo
    if (!state.reverse || state.speed == 0) {
        triggerWarning(false);
    }
}

function triggerWarning(isWarning) {
    if (state.warning === isWarning) return; 
    state.warning = isWarning;
    
    var radar = document.getElementById('radarView');
    if(!radar) return;
    
    if (isWarning) {
        radar.classList.add('warning');

        // --- CẬP NHẬT MỚI: PHANH KHẨN CẤP (EMERGENCY STOP) ---
        if (state.speed > 0) {
            console.log("⚠️ VẬT CẢN: DỪNG XE NGAY LẬP TỨC!");
            
            // 1. Cắt ga trên giao diện
            slider.value = 0;
            if(sliderThumb) sliderThumb.style.bottom = "0%";
            if(speedText) speedText.innerText = "0%";
            if(digitalSpeed) digitalSpeed.innerText = "0";
            
            // 2. Cập nhật trạng thái nội bộ
            state.speed = 0;

            // 3. Tắt Cruise Control (nếu đang bật)
            if(state.cruise) {
                state.cruise = false;
                var btnCruise = document.getElementById('btnCruise');
                if(btnCruise) btnCruise.classList.remove('active');
            }

            // 4. Gửi lệnh Phanh gấp
            send("SPEED=0");
            send("BRAKE_ON");
            // Nhả phanh sau 1 giây để không bị kẹt bánh mãi mãi
            setTimeout(function() { send("BRAKE_OFF"); }, 1000);
        }
        // -----------------------------------------------------

        if (!warningInterval) {
            var toggle = false;
            warningInterval = setInterval(function() {
                toggle = !toggle;
                var btnHead = document.getElementById('btnHeadLight');
                if(btnHead) {
                    if(state.headLight) {
                        btnHead.classList.add('active');
                    } else {
                        if(toggle) btnHead.classList.add('active');
                        else btnHead.classList.remove('active');
                    }
                }
                if(toggle) beep(150, 800);
            }, 300); 
        }
    } else {
        radar.classList.remove('warning');
        if (warningInterval) { clearInterval(warningInterval); warningInterval = null; }
        
        var btnHead = document.getElementById('btnHeadLight');
        if(btnHead) {
            if(state.headLight) btnHead.classList.add('active');
            else btnHead.classList.remove('active');
        }
    }
}


// 4. PHANH MỀM (MANUAL)
var btnBrake = document.getElementById('btnBrake');
var sliderContainer = document.querySelector('.slider-container');

var startBrake = function(e) {
    if(e.cancelable) e.preventDefault();
    if(state.braking) return;
    state.braking = true;
    btnBrake.classList.add('active');
    slider.disabled = true; 
    if(sliderContainer) sliderContainer.classList.add('locked');
    
    if(state.cruise) { 
        state.cruise = false; 
        var btnCruise = document.getElementById('btnCruise');
        if(btnCruise) btnCruise.classList.remove('active'); 
    }
    send('BRAKE_ON');

    if (parseInt(slider.value) > 0) {
        brakeInterval = setInterval(function() {
            var newSpeed = parseInt(slider.value) - BRAKE_STEP;
            if (newSpeed <= 0) { newSpeed = 0; clearInterval(brakeInterval); }
            syncSpeedUI(newSpeed);
        }, BRAKE_RATE);
    } else syncSpeedUI(0);
};

var endBrake = function(e) {
    if(e.cancelable) e.preventDefault();
    state.braking = false;
    btnBrake.classList.remove('active');
    if (brakeInterval) { clearInterval(brakeInterval); brakeInterval = null; }
    slider.disabled = false; 
    if(sliderContainer) sliderContainer.classList.remove('locked');
    send('BRAKE_OFF');
};

if(btnBrake) {
    btnBrake.addEventListener('touchstart', startBrake, {passive: false});
    btnBrake.addEventListener('touchend', endBrake);
    btnBrake.addEventListener('mousedown', startBrake);
    btnBrake.addEventListener('mouseup', endBrake);
}


// 5. NÚT CÒI
var btnHorn = document.getElementById('btnHorn');
if(btnHorn) {
    var hornOn = function(e){ if(e.cancelable) e.preventDefault(); btnHorn.classList.add('active'); send('HORN_ON'); };
    var hornOff = function(e){ if(e.cancelable) e.preventDefault(); btnHorn.classList.remove('active'); send('HORN_OFF'); };
    
    btnHorn.addEventListener('touchstart', hornOn, {passive: false});
    btnHorn.addEventListener('touchend', hornOff);
    btnHorn.addEventListener('mousedown', hornOn);
    btnHorn.addEventListener('mouseup', hornOff);
}


// 6. NÚT CRUISE & CÁC NÚT KHÁC (SETUP CHUNG)
function setupButton(id, callback) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', function(e) { if(e.cancelable) e.preventDefault(); callback(); }, {passive: false});
    btn.addEventListener('mousedown', function(e) { if(e.cancelable) e.preventDefault(); callback(); });
}

setupButton('btnHeadLight', function() { toggleFunc('HEADLIGHT'); });
setupButton('btnRev', function() { toggleFunc('REV'); });
setupButton('btnCruise', function() {
    if (state.braking) return;
    state.cruise = !state.cruise;
    var btn = document.getElementById('btnCruise');
    if(btn) btn.classList.toggle('active', state.cruise);
    if (!state.cruise && slider.value > 0) syncSpeedUI(0);
});


// 7. VÔ LĂNG
var steerZone = document.getElementById('steeringZone');
var wheel = document.getElementById('wheel');
var angleText = document.getElementById('angleText');
var steeringTouchId = null; 

function calculateAngle(clientX) {
    var rect = steerZone.getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    var deg = Math.round(((clientX - centerX) / (rect.width / 2)) * 90);
    if (deg > 90) deg = 90; if (deg < -90) deg = -90; return deg;
}
function updateSteerUI(deg) {
    if (state.angle !== deg) { 
        state.angle = deg; 
        wheel.style.transform = "rotate(" + deg + "deg)"; 
        angleText.innerText = deg + "°"; 
        send("STEER=" + deg); 
    }
}
if(steerZone) {
    steerZone.addEventListener('touchstart', function(e) { e.preventDefault(); if (steeringTouchId === null) { var touch = e.changedTouches[0]; steeringTouchId = touch.identifier; updateSteerUI(calculateAngle(touch.clientX)); } }, {passive: false});
    steerZone.addEventListener('touchmove', function(e) { e.preventDefault(); if (steeringTouchId !== null) { for (var i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === steeringTouchId) { updateSteerUI(calculateAngle(e.changedTouches[i].clientX)); break; } } } }, {passive: false});
    var endSteer = function(e) { e.preventDefault(); if (steeringTouchId !== null) { for (var i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === steeringTouchId) { steeringTouchId = null; updateSteerUI(0); break; } } } };
    steerZone.addEventListener('touchend', endSteer); steerZone.addEventListener('touchcancel', endSteer);
}

// Fullscreen
var headerTitle = document.querySelector('.hud-center');
if(headerTitle) {
    headerTitle.addEventListener('click', function(){ 
        if(!document.fullscreenElement) {
            if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function(){});
        } else {
            if(document.exitFullscreen) document.exitFullscreen(); 
        }
    });
}