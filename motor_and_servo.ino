#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>
#include <LittleFS.h>

// =============================================================
// 1. CẤU HÌNH WIFI
// =============================================================
const char* ssid = "ECAR_CONTROLLER"; 
const char* password = "12345678";

// =============================================================
// 2. CẤU HÌNH CHÂN (PINOUT)
// =============================================================
// --- Cảm biến siêu âm HC-SR04 ---
const int trigPin = 13;
const int echoPin = 12;

// --- Còi & Đèn ---
const int hornPin = 18;
const int lightPin = 23;

// --- Motor & Servo ---
const int servoPin = 2;
const int in1 = 26; 
const int in2 = 25; 
const int enA = 19; 

// =============================================================
// 3. BIẾN TOÀN CỤC & TRẠNG THÁI
// =============================================================
Servo myServo;
WebServer server(80);

// Thông số Servo
const int SERVO_MIN = 60;  
const int SERVO_MAX = 140; 

// Trạng thái xe
int currentSpeed = 0;
bool isReverse = false;

// Trạng thái thủ công (lưu lệnh từ Web)
bool manualLight = false;
bool manualHorn = false;

// Biến cho việc chớp tắt (Non-blocking delay)
unsigned long previousMillis = 0;
bool warningState = false; // Trạng thái Bật/Tắt của cảnh báo
const long interval = 500; // Delay 1s (1000ms) như yêu cầu

// =============================================================
// 4. HÀM ĐỌC KHOẢNG CÁCH (HC-SR04)
// =============================================================
float getDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  // Đọc thời gian phản hồi (timeout 30ms để không treo xe)
  long duration = pulseIn(echoPin, HIGH, 30000); 
  
  if (duration == 0) return 999; // Không thấy gì -> Trả về số lớn
  return duration * 0.034 / 2;   // Tính ra cm
}

// =============================================================
// 5. HÀM XỬ LÝ AN TOÀN
// =============================================================
void handleSafety() {
  // Chỉ kích hoạt khi ĐANG LÙI
  if (isReverse) {
    float distance = getDistance();
    
    // Nếu khoảng cách < 15cm (Đã tăng ngưỡng an toàn)
    if (distance > 0 && distance < 15) {
      
      // BƯỚC 1: CAN THIỆP PHANH KHẨN CẤP NGAY LẬP TỨC
      digitalWrite(in1, LOW); 
      digitalWrite(in2, LOW); 
      ledcWrite(enA, 0); // Ngắt hoàn toàn công suất động cơ

      // BƯỚC 2: CẢNH BÁO ÂM THANH & ÁNH SÁNG
      unsigned long currentMillis = millis();
      if (currentMillis - previousMillis >= interval) {
        previousMillis = currentMillis;
        warningState = !warningState; 
        
        digitalWrite(lightPin, warningState ? HIGH : LOW);
        digitalWrite(hornPin, warningState ? HIGH : LOW);
      }
      return; // Cắt luồng tại đây để duy trì trạng thái dừng/cảnh báo
    }
  }

  // Nếu KHÔNG lùi, hoặc ĐANG lùi nhưng Khoảng cách AN TOÀN
  // -> Trả lại trạng thái đèn/còi theo lệnh nút bấm trên Web
  digitalWrite(lightPin, manualLight ? HIGH : LOW);
  digitalWrite(hornPin, manualHorn ? HIGH : LOW);
  
  // Reset trạng thái cảnh báo
  warningState = false; 
}

// =============================================================
// 6. CÁC HÀM CƠ BẢN (LittleFS, Motor, Server)
// =============================================================
String getContentType(String filename) {
  if (filename.endsWith(".html")) return "text/html";
  else if (filename.endsWith(".css")) return "text/css";
  else if (filename.endsWith(".js")) return "application/javascript";
  else if (filename.endsWith(".png")) return "image/png";
  return "text/plain";
}

bool handleFileRead(String path) {
  if (path.endsWith("/")) path += "gui.html"; 
  if (LittleFS.exists(path)) {
    File file = LittleFS.open(path, "r");
    server.streamFile(file, getContentType(path));
    file.close();
    return true;
  }
  return false;
}

void controlMotor() {
  if (currentSpeed == 0) {
    digitalWrite(in1, LOW); digitalWrite(in2, LOW); ledcWrite(enA, 0);
  } else {
    if (!isReverse) { 
      digitalWrite(in1, HIGH); digitalWrite(in2, LOW); 
    } else { 
      digitalWrite(in1, LOW); digitalWrite(in2, HIGH); 
    }
    ledcWrite(enA, currentSpeed);
  }
}

void handleCommand() {
  if (server.hasArg("q")) {
    String cmd = server.arg("q");
    
    // --- LÁI & TỐC ĐỘ ---
    if (cmd.startsWith("STEER=")) {
      int val = map(cmd.substring(6).toInt(), -90, 90, SERVO_MIN, SERVO_MAX);
      myServo.write(constrain(val, SERVO_MIN, SERVO_MAX));
    }
    else if (cmd.startsWith("SPEED=")) {
      currentSpeed = map(cmd.substring(6).toInt(), 0, 100, 0, 255);
      if(currentSpeed > 0 && currentSpeed < 60) currentSpeed = 60;
      controlMotor();
    }
    // --- SỐ (FWD/REV) ---
    else if (cmd == "MODE_FWD") { isReverse = false; controlMotor(); }
    else if (cmd == "MODE_REV") { isReverse = true; controlMotor(); }
    
    // --- PHANH ---
    else if (cmd == "BRAKE_ON") { digitalWrite(in1, LOW); digitalWrite(in2, LOW); ledcWrite(enA, 255); }
    else if (cmd == "BRAKE_OFF") { controlMotor(); }

    // --- ĐÈN & CÒI (Lưu trạng thái thủ công) ---
    else if (cmd == "HEAD_ON") { manualLight = true; }
    else if (cmd == "HEAD_OFF") { manualLight = false; }
    else if (cmd == "HORN_ON") { manualHorn = true; }
    else if (cmd == "HORN_OFF") { manualHorn = false; }
    
    server.send(200, "text/plain", "OK");
  } else {
    server.send(400, "text/plain", "Bad Request");
  }
}

// =============================================================
// 7. SETUP & LOOP
// =============================================================
void setup() {
  Serial.begin(115200);

  // LittleFS
  if (!LittleFS.begin()) { Serial.println("Loi LittleFS!"); return; }

  // Pin Modes
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(hornPin, OUTPUT);
  pinMode(lightPin, OUTPUT);
  pinMode(in1, OUTPUT); 
  pinMode(in2, OUTPUT);

  // Servo & PWM
  myServo.setPeriodHertz(50);
  myServo.attach(servoPin, 500, 2400); 
  myServo.write((SERVO_MIN+SERVO_MAX)/2);
  ledcAttach(enA, 1000, 8); 

  // WiFi
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid, password);
  Serial.print("IP: "); Serial.println(WiFi.softAPIP());

  // Server
  server.on("/cmd", handleCommand);
  server.onNotFound([]() { if(!handleFileRead(server.uri())) server.send(404, "text/plain", "404"); });
  server.begin();
}

void loop() {
  server.handleClient(); // Xử lý Web
  handleSafety();        // Xử lý Cảm biến lùi & Cảnh báo (Chạy liên tục)
}