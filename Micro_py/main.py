import machine
import shrike
import time

uart = machine.UART(0, baudrate=115200, tx=machine.Pin(28), rx=machine.Pin(29), rxbuf=4096, timeout=1000)
fpga_reset = machine.Pin(14, machine.Pin.OUT, value=1)

def debug_print(msg):
    uart.write((str(msg).strip() + '\n').encode('utf-8'))
    print(f"[UART TX] {msg}")
    time.sleep(0.05)

def hard_reset_fpga():
    fpga_reset.value(0)
    time.sleep(0.1)
    fpga_reset.value(1)
    time.sleep(0.5)

def wait_for_ota():
    debug_print("FPGA_STATE:IDLE")
    last_heartbeat = time.ticks_ms()

    while True:
        # 1. Send heartbeat every 4 seconds
        if time.ticks_diff(time.ticks_ms(), last_heartbeat) > 4000:
            debug_print("HEARTBEAT")
            last_heartbeat = time.ticks_ms()

        # 2. Listen for ESP32 Commands
        if uart.any():
            line = uart.readline()
            if line:
                try:
                    decoded_line = line.decode('utf-8', 'ignore').strip()

                    # --- STEP 1: FLASH_PREP ---
                    if decoded_line.startswith('FLASH_PREP:'):
                        filename = decoded_line.split(':')[1]
                        debug_print("FPGA_STATE:CONFIGURE")
                        debug_print("ACK")  # Tell ESP32 we are ready!

                    # --- STEP 2: SIZE & TRANSFER ---
                    elif decoded_line.startswith('SIZE:'):
                        expected_size = int(decoded_line.split(':')[1])
                        debug_print(f"Incoming Bitstream: {expected_size} bytes")

                        received_bytes = 0
                        chunk_size = 512
                        timeout_timer = time.ticks_ms()

                        with open("ota_update.bin", "wb") as f:
                            debug_print("ACK") # ACK for the SIZE command
                            
                            while received_bytes < expected_size:
                                remaining = expected_size - received_bytes
                                to_read = min(chunk_size, remaining)

                                if uart.any() >= to_read:
                                    chunk = uart.read(to_read)
                                    f.write(chunk)
                                    received_bytes += len(chunk)
                                    timeout_timer = time.ticks_ms()
                                    debug_print("ACK") # ACK for this specific chunk

                                if time.ticks_diff(time.ticks_ms(), timeout_timer) > 8000:
                                    debug_print(f"ERROR: Timeout! Got {received_bytes}/{expected_size}")
                                    debug_print("FPGA_STATE:IDLE")
                                    break

                        # --- STEP 3: FLASH ---
                        if received_bytes == expected_size:
                            debug_print("Download 100%. Flashing FPGA...")
                            
                            # Fire one last heartbeat before we block the processor!
                            debug_print("HEARTBEAT")
                            
                            shrike.flash("ota_update.bin") # <--- BLOCKING CALL
                            hard_reset_fpga()
                            
                            debug_print("OTA_SUCCESS")
                            debug_print("FPGA_STATE:USER_MODE")

                        # Reset timer so we don't immediately timeout after waking up
                        last_heartbeat = time.ticks_ms()
                        
                    # --- Catch-all for debugging ---
                    else:
                        print(f"[UART RX] Unknown or ignored: {decoded_line}")

                except Exception as e:
                    if str(e): debug_print(f"Crash: {str(e)}")

wait_for_ota()
