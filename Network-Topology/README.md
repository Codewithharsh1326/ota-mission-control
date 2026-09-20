# Network Topology

Cisco Packet Tracer 9.0.1 simulation of the network path used by OTA Mission Control.

**File:** `DCN_Project.pkt` (open with Cisco Packet Tracer; GitHub cannot preview it)

## What it models

- Two separate private networks: the ESP32-S3 side (HomeNet-A) and the Browser side (HomeNet-B).
- A public FastAPI broker that both networks reach through an ISP backbone.
- The ESP32 always initiates the connection outward, so it never needs to be reachable from outside.

## Topology

```
[ESP32-PC] -WiFi- [WRT300N-A: NAT] - [R-HOME-A] - [R-ISP1] - [R-ISP2] - [R-SERVER: ACL] - [SW-SERVER] - [Broker-Server]
                                                                 |
[Browser-PC] -Wired- [WRT300N-B: NAT] - [R-HOME-B] --------------┘
```

## Key points

- 5x Cisco 2911 routers, 2x WRT300N home routers, 1 switch, 2 PCs, 1 server.
- OSPF (Area 0) runs on all 5 routers.
- NAT (PAT/overload) is done on the WRT300N routers, with DHCP for each home LAN.
- Router-to-router links use /30 subnets; the server subnet is /29.
- An extended ACL (`PROTECT-SERVER`) on R-SERVER permits only ports 8000 and 443, plus ICMP. It is applied outbound on Gi0/0.

## IP addressing

| Network | Subnet | Gateway |
|---|---|---|
| HomeNet-A LAN | 192.168.1.0/24 | 192.168.1.1 |
| HomeNet-B LAN | 192.168.2.0/24 | 192.168.2.1 |
| Server LAN | 200.10.10.0/29 | 200.10.10.1 |
| Broker-Server | 200.10.10.2 (static) | 200.10.10.1 |

Router-to-router links use `10.0.x.x/30` addresses.

## Assumptions

- `200.10.10.x` stands in for the real public IP of the broker.
- Ports 8000 (WS/HTTP) and 443 (HTTPS via Nginx) match the real deployment.
- WebSockets, UART and FPGA flashing are not simulated; Packet Tracer only models the IP network path.
- WRT300N WAN gateways must be set to the connected router (`10.0.1.1` and `10.0.2.1`).

## Test

From ESP32-PC or Browser-PC, run `ping 200.10.10.2`. It should succeed.
