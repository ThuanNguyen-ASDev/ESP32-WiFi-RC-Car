# ESP32-WiFi-RC-Car
This project utilizes a Client-Server model, where the ESP32 microcontroller acts as the Server (broadcasting WiFi and processing hardware logic) and the mobile web browser acts as the Client (Control Dashboard).

1. Firmware (Uploaded to the ESP32)
📄 motor_and_servo.ino
This is the "heart" of the system, the main C++ source code running on the ESP32 microcontroller. It handles the following core responsibilities:

Network Initialization: Configures the ESP32 as an Access Point (SoftAP) broadcasting WiFi with the SSID ECAR_CONTROLLER and password 12345678.

Web Server: Hosts and serves the UI files (HTML, CSS, JS, images) from the ESP32's LittleFS memory partition to the user's mobile browser.

Hardware Control: Directly manages the GPIO pins connected to:

Steering Servo: Uses the ESP32Servo library to control the steering angle via pin 2.

Drive Motor: Controls speed via PWM (pin enA) and direction (pins in1, in2) through an H-bridge motor driver to move forward/backward.

Safety System (AEB): Continuously reads data from the HC-SR04 ultrasonic sensor. If an obstacle is detected within 15cm while reversing, the system instantly triggers the Automatic Emergency Braking by locking the motor (ledcWrite(enA, 0)) and flashing the warning lights/horn.

Command Handling: Listens to HTTP GET Requests sent to the /cmd?q= endpoint and translates them into physical control actions.

2. User Interface (Stored in the LittleFS partition)
The three files below make up the Control Dashboard on the mobile screen. They work synchronously to deliver a smooth, low-latency experience similar to a Native App.

📄 gui.html (Interface Skeleton)
Defines the semantic HTML structure of the entire dashboard.

The layout is strictly divided into 3 main zones:

Left Zone: Contains the virtual steering wheel.

Center Zone: Displays the digital speedometer, collision warning radar, and the main control deck (headlights, horn, cruise control, and manual brake).

Right Zone: Houses the vertical throttle slider and the reverse gear toggle.

Prevents unintended zooming or scrolling on mobile browsers using strict <meta viewport> constraints.

📄 style.css (Aesthetics & Layout)
Responsible for the visual design, colors, and responsive layout mapping.

Applies a "Dark Mode" theme (Night Cockpit concept) accented with neon blue (#00d2ff).

Handles UI animations using pure CSS to reduce the processing load on the browser:

Red flashing radar waves when an obstacle is detected.

Glowing drop-shadow effects for active buttons.

An overlay warning screen prompting the user to rotate their phone into Landscape mode.

📄 main.js (Interface Brain & Logic)
Manages all user touch events and transmits telemetry data back to the ESP32.

Steering Logic: Calculates the user's finger coordinates on the steering zone, converts them into a valid rotation angle (-90° to 90°), and updates the visual wheel in real-time.

Throttle Logic: Captures vertical slider movements to continuously send speed parameters (SPEED=0..100) to the server.

Communication Bridge: Contains the send(cmd) function, which dispatches asynchronous HTTP Requests (e.g., STEER=45, HEAD_ON) to the ESP32.

Dual Safety (Client-side AEB): In addition to the hardware braking on the ESP32, this JS script includes logic to visually lock the throttle slider, drop the UI speed to 0%, and disengage Cruise Control immediately when receiving a reverse collision warning.
