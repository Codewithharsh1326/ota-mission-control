import machine
import shrike
import time

# UART mapped exactly to your specified pins
uart = machine.UART(0, baudrate=115200, tx=machine.Pin(28), rx=machine.Pin(29), rxbuf=4096, timeout=1000)

# FPGA Reset Pin
fpga_reset = machine.Pin(14, machine.Pin.OUT, value=1)

def debug_print(msg):
    # Send a message over UART to the ESP32
    uart.write((str(msg).strip() + '\n').encode('utf-8'))
    time.sleep(0.05)

def hard_reset_fpga():
    # Hardware Reset Sequence to wake up the FPGA logic
    fpga_reset.value(0)  # Pull LOW to reset
    time.sleep(0.1)
    fpga_reset.value(1)  # Pull HIGH to RUN
    time.sleep(0.5)      # Give it a half-second to stabilize

def wait_for_ota():
    debug_print("FPGA_STATE:IDLE")
    
    # 1. Flash the fallback bitstream on boot
    try:
        shrike.flash("FPGA_bitstream_MCU.bin")
        hard_reset_fpga()
        debug_print("FPGA_STATE:USER_MODE") # This will turn the dashboard badge GREEN
    except Exception as e:
        debug_print(f"Boot Flash Error: {str(e)}")

    last_heartbeat = time.ticks_ms()

    # 2. Main Event Loop
    while True:
        # Send heartbeat every 4 seconds (keeps the ESP32's 5s timeout happy)
        if time.ticks_diff(time.ticks_ms(), last_heartbeat) > 4000:
            debug_print("HEARTBEAT")
            last_heartbeat = time.ticks_ms()

        line = uart.readline()
        if line:
            try:
                decoded_line = line.decode('utf-8', 'ignore').strip()

                # --- STEP 1: ESP32 tells RP2040 a flash is coming ---
                if decoded_line.startswith('FLASH_PREP:'):
                    filename = decoded_line.split(':')[1]
                    debug_print("FPGA_STATE:CONFIGURE") # Turns dashboard badge AMBER
                    debug_print(f"Ready for file: {filename}. Send SIZE:")

                # --- STEP 2: The actual file transfer begins ---
                elif decoded_line.startswith('SIZE:'):
                    expected_size = int(decoded_line.split(':')[1])
                    debug_print(f"Incoming Bitstream: {expected_size} bytes")

                    received_bytes = 0
                    chunk_size = 256
                    timeout_timer = time.ticks_ms()

                    with open("ota_update.bin", "wb") as f:
                        debug_print("ACK")
                        while received_bytes < expected_size:
                            remaining = expected_size - received_bytes
                            to_read = min(chunk_size, remaining)

                            if uart.any() >= to_read:
                                chunk = uart.read(to_read)
                                f.write(chunk)
                                received_bytes += len(chunk)
                                timeout_timer = time.ticks_ms()
                                debug_print("ACK")

                            # Abort if the ESP32 stops sending data
                            if time.ticks_diff(time.ticks_ms(), timeout_timer) > 8000:
                                debug_print(f"ERROR: Timeout! Got {received_bytes} / {expected_size}")
                                debug_print("FPGA_STATE:USER_MODE") 
                                break

                    # --- STEP 3: File received, flash the FPGA! ---
                    if received_bytes == expected_size:
                        debug_print("Download 100%. Flashing FPGA...")
                        shrike.flash("ota_update.bin")
                        hard_reset_fpga()
                        debug_print("OTA_SUCCESS")
                        debug_print("FPGA_STATE:USER_MODE") # Flash complete, back to GREEN

                    # Reset heartbeat timer so we don't timeout immediately after flashing
                    last_heartbeat = time.ticks_ms()

            except Exception as e:
                if str(e): debug_print(f"Crash: {str(e)}")

wait_for_ota()