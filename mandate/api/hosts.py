"""Which addresses a grounding fetch may reach: public unicast only.

A leaf module (standard library only) so that mandate-api's /grounding/fetch and the bench's
grounding bridge (web/scripts/brain_tool_grounding.py), which runs without FastAPI, apply the
SAME guard. mandate.api.app re-exports it.
"""
from __future__ import annotations

import ipaddress

NAT64 = ipaddress.ip_network("64:ff9b::/96")


def is_public_address(addr: str) -> bool:
    """May mandate-api fetch from this address? Public unicast only.

    An IPv6 address that CARRIES an IPv4 one is judged by the IPv4 inside it:
    on a NAT64 network (DNS64) every IPv4-only site resolves to 64:ff9b::/96,
    which Python classes as reserved, and refusing it refused every such site
    (the smoke run of 9 Nov lost all its German and Italian sources to this).
    """
    ip = ipaddress.ip_address(addr.split("%")[0])
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        elif ip in NAT64:
            ip = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
                or ip.is_multicast or ip.is_unspecified)
