# seven_seg_clock

**Difficulty:** Intermediate

**Uses MCU:** No

**External Hardware:** PMOD 7-Segment Display

## Overview

This example demonstrates the use of a [PMOD 7-Segment Display module (available from 1BitSquared)](https://1bitsquared.com/products/pmod-7-segment-display) with Shrike.

7-Segment displays are widely used in FPGA projects. A standard 2-digit 7-segment PMOD does not drive both digits simultaneously. Instead, the FPGA uses **time-multiplexing**, rapidly switching between digits while sharing segment lines. The refresh rate is fast enough to appear continuous to the human eye.

This design implements a **00–99 counter** with a **1-second heartbeat**, demonstrating practical time-multiplexing logic.

## Compatibility

| Board                | Firmware                | Status     |
| -------------------- | ----------------------- | ---------- |
| Shrike-Lite (RP2040) | `firmware/arduino-ide/` | ✅ Tested   |
| Shrike (RP2350)      | `firmware/arduino-ide/` | ✅ Tested   |
| Shrike-fi (ESP32-S3) | `firmware/arduino-ide/` | ⬜ Untested |

> FPGA bitstream is the same across all boards.

## Hardware Setup

### Required Components

1. [2 x 6 female pin right-angled PMOD connector](https://www.digikey.in/en/products/detail/w%C3%BCrth-elektronik/613012243121/16608604)
2. [PMOD 7-Segment Display module (1BitSquared)](https://1bitsquared.com/products/pmod-7-segment-display)

   * Or fabricate from [source files](https://github.com/icebreaker-fpga/icebreaker-pmod/tree/master/7segment/v1.2a)
3. Optional: Push button connected to FPGA GPIO7 (F7) for reset (`rst_n`)

### Connection Notes

* Connect PMOD to FPGA PMOD header (3.3V, GND, F8–F15)
* Ensure correct orientation and soldering of connector

---

## Quick Start (Pre-Built Bitstream)

1. Connect Shrike board via USB
2. Attach the 7-segment PMOD
3. Upload `bitstream/seven_segment_pmod_clock.bin` using ShrikeFlash
4. Expected result: Display shows a counter incrementing from `00` to `99` every second

---

## Build From Source

### FPGA (Verilog)

1. Open `seven_segment_pmod_clock.ffpga` in Go Configure Software Hub
2. Configure I/O mapping
3. Click **Synthesize → Generate Bitstream**
4. Output will be in `ffpga/build/`

### Firmware

No firmware required for this example.

---

## How It Works

The design is composed of multiple modules working together:

* **Clock Source**

  * `clk` = 50 MHz system clock

* **1 Hz Tick Generator**

  * `gen_1Hz_tick` converts system clock to `tick_1Hz`

* **Counter Logic**

  * `bcd_two_digit_counter` increments from 00 → 99
  * Resets after reaching 99

* **Multiplexing Clock**

  * `time_multiplexing_clock` generates `tick_195KHz`
  * Used to alternate between digits

* **7-Segment Driver**

  * `seven_segment_decoder_driver`:

    * Latches counter value every second
    * Alternates active digit using `active_num`
    * Converts BCD to segment signals

### Key Concept: Time Multiplexing

* Only one digit is active at a time
* Switching happens at high frequency (~195 kHz)
* Human eye perceives both digits as continuously lit

---

## Visual Output

<p align="center">
  <img src="./media/board_with_pmod_module.jpg" width="800"/>
</p>
<p align="center"><em>Design running on Shrike</em></p>

---

## Expected Output

* Display shows values from `00` → `99`
* Increments once per second
* Both digits appear continuously ON due to multiplexing
* After `99`, counter resets to `00`

---

## Notes

* `rst_n` is active-low reset
* Optional button can be connected to GPIO7 (F7) for reset control
* Alternatively, `rst_n` can be connected to `FPGA_CORE_READY` in I/O Planner
