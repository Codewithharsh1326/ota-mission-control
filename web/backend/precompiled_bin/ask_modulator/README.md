# ask_modulator

**Difficulty:** Advanced

**Uses MCU:** Yes

**External Hardware:** RC Filter (1 kΩ Resistor, 10 nF Capacitor), Oscilloscope (optional)

## Overview

This example implements a mixed-signal Digital-to-Analog communication system using the Shrike board. The FPGA generates a sine wave using Direct Digital Synthesis (DDS), converts it into a PWM signal, and modulates it using Amplitude Shift Keying (ASK) controlled by the RP2040. You will learn DDS, PWM-based DAC techniques, and FPGA–MCU co-design for communication systems.

## Compatibility

| Board                | Firmware                | Status     |
| -------------------- | ----------------------- | ---------- |
| Shrike-Lite (RP2040) | `firmware/micropython/` | ✅ Tested   |
| Shrike (RP2350)      | `firmware/micropython/` | ✅ Tested   |
| Shrike-fi (ESP32-S3) | `firmware/micropython/` | ⬜ Untested |

> FPGA bitstream is the same across all boards.

## Hardware Setup

### RC Filter (Required for Analog Output)

The FPGA outputs a high-frequency PWM signal. An RC low-pass filter is required to reconstruct the analog sine wave.

* Resistor: 1 kΩ
* Capacitor: 10 nF (Code 103)
* Cutoff Frequency: ~15.9 kHz

**Connection:**

* FPGA Output → Resistor → Output Node
* Capacitor from Output Node → Ground
* Probe at Output Node

### Pin Connections

| Signal           | RP2040 Pin | FPGA Pin (Board Label) | Physical Pin |
| ---------------- | ---------- | ---------------------- | ------------ |
| Freq Bit 0 (LSB) | GPIO 5     | FPGA_IO1               | PIN 14       |
| Freq Bit 1       | GPIO 6     | FPGA_IO2               | PIN 15       |
| Freq Bit 2       | GPIO 7     | FPGA_IO17              | PIN 8        |
| Freq Bit 3       | GPIO 8     | FPGA_IO18              | PIN 9        |
| Freq Bit 4       | GPIO 9     | FPGA_IO8               | PIN 23       |
| Freq Bit 5 (MSB) | GPIO 10    | FPGA_IO9               | PIN 24       |
| Data / Enable    | GPIO 16    | FPGA_IO0               | PIN 13       |
| PWM Output       | —          | FPGA_IO14              | PIN 5        |

> Ensure common ground between RP2040 and FPGA.

## Quick Start (Pre-Built Bitstream)

1. Generate and upload the FPGA bitstream
2. Copy `flash.py` and `helloshrike.py` to the RP2040
3. Run `flash.py` once to configure FPGA
4. Run `helloshrike.py`
5. Observe PWM output on FPGA_IO14 using an oscilloscope

Expected result: Bursts of sine waves representing transmitted data using ASK modulation

## Build From Source

### FPGA (Verilog)

1. Open project in Go Configure Software Hub
2. Select FPGA part `SLG47910V (Rev BB)`
3. Paste Verilog into `main.v`
4. Configure I/O Planner and generate bitstream

### Firmware (MicroPython)

1. Open `flash.py` and `helloshrike.py` in Thonny
2. Upload to RP2040
3. Run scripts

## How It Works

The FPGA implements a DDS-based signal generator with three main components:

1. **Phase Accumulator:**
   A 16-bit counter incremented by a tuning word each clock cycle. This determines output frequency.

2. **Sine LUT:**
   A 64-entry lookup table mapping phase to amplitude (0–63), generating a sine waveform.

3. **PWM Generator:**
   Converts amplitude into a 1-bit PWM signal (~781 kHz switching frequency).

ASK modulation is applied at output:

* `i_data = 1` → sine wave transmitted
* `i_data = 0` → output forced to zero

The RP2040:

* Sends frequency tuning word (6-bit parallel bus)
* Controls modulation signal
* Encodes characters using a custom 6-bit encoding scheme

### Key Equations

* PWM Frequency:
  `50 MHz / 64 ≈ 781.25 kHz`

* Output Frequency:
  `F_out = (F_clk × TW) / 2^16`

* Example:
  `TW = 1 → ~762 Hz`

## Expected Output

### Oscilloscope Output

* Logic 1 → Sine wave (~3V peak)
* Logic 0 → Flat line (0V)

Signal appears as bursts of sine waves separated by silence.

### Terminal Output

```
--- Transmitting: HelloShrike123 ---
Sending 'H' -> Code 01 -> 000001
Sending 'e' -> Code 02 -> 000010
Sending 'l' -> Code 03 -> 000011
Sending 'l' -> Code 03 -> 000011
Sending 'o' -> Code 04 -> 000100
Sending 'S' -> Code 05 -> 000101
Sending 'h' -> Code 06 -> 000110
Sending 'r' -> Code 07 -> 000111
Sending 'i' -> Code 08 -> 001000
Sending 'k' -> Code 09 -> 001001
Sending 'e' -> Code 02 -> 000010
Sending '1' -> Code 51 -> 110011
Sending '2' -> Code 52 -> 110100
Sending '3' -> Code 53 -> 110101
```

The waveform corresponds to encoded binary data transmitted via ASK.

## Notes

* Noise on FPGA GPIO inputs may be interpreted as logic high
* External pull-ups are not strictly required in this setup
* Full ASCII support can be implemented by extending encoding (exercise for user)
