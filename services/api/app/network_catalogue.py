"""Fixed catalogue for the Network Identifier Master (docs/NETWORK_IDENTIFIER_MASTER.md).

Every documentation link here was read on 15 November 2026 from the provider's own page (or an official document).
Administrators pick a link by id; they can never type a URL, so the page never shows an unreviewed external link.
`kind` says what the link is: api_docs (public API documentation), partner_portal (access needs an account, contract
or NDA), spec_document (a published interface document, not an API). Providers with no verified public API have no link.
"""

VERIFIED_ON = "2026-11-15"

DOC_LINKS: dict[str, dict] = {
    "starlink_support": {
        "kind": "partner_portal", "url": "https://starlink.com/support/article/90109cc2-c7ec-31ff-d160-0a87f16ef759",
        "summary": "Management and Telemetry APIs for enterprise accounts; the documentation password comes from a Starlink account manager.",
        "access": "Enterprise account", "sdk": None},
    "navic_icd": {
        "kind": "spec_document",
        "url": "https://www.isro.gov.in/media_isro/pdf/SateliteNavigation/1a_messgingicd_receiver_incois_approved_ver_1.2.pdf",
        "summary": "Signal-in-space interface document for NavIC one-way messages. Broadcasting is for authorised agencies only.",
        "access": "Authorised broadcasters", "sdk": None},
    "inmarsat_idp": {
        "kind": "partner_portal", "url": "https://developer.inmarsat.com/technology/idp/",
        "summary": "IsatData Pro short-message service; the API reference needs developer registration and a service contract.",
        "access": "Developer registration and contract",
        "sdk": {"name": "isatdatapro-api (Node.js)", "licence": "Apache-2.0", "url": "https://github.com/Inmarsat/isatdatapro-api"}},
    "iridium_cloudconnect": {
        "kind": "partner_portal", "url": "https://iridium.com/services/iridium-cloudconnect",
        "summary": "Short Burst Data delivered to the customer's cloud account. No public developer documentation; access through a service provider.",
        "access": "Service provider and NDA", "sdk": None},
    "globalstar_spot": {
        "kind": "api_docs",
        "url": "https://www.globalstar.com/en-us/support-center/spot-for-business/spot-gen4/get-help/general/public-api-and-xml-feed",
        "summary": "Message feed for a shared SPOT device feed. Needs the device owner's feed id; push needs a commercial licence.",
        "access": "Device account feed id", "sdk": None},
    "skylo_devices": {
        "kind": "partner_portal", "url": "https://www.skylo.tech/certified-devices",
        "summary": "3GPP NB-IoT over satellite for certified modems. Public material covers device certification, not an API.",
        "access": "Device certification", "sdk": None},
    "celestrak_gp": {
        "kind": "api_docs", "url": "https://celestrak.org/NORAD/documentation/gp-data-formats.php",
        "summary": "Public orbital elements by constellation group. No key. The usage policy asks for one download per update and to stop on any error.",
        "access": "Free, no account", "sdk": None},
    "opencellid_api": {
        "kind": "api_docs", "url": "https://docs.opencellid.org/docs/api/overview",
        "summary": "Estimated cell tower locations. Needs an API key; data is CC BY-SA 4.0 (share-alike). Towers here stay synthetic.",
        "access": "Free API key, CC BY-SA 4.0", "sdk": None},
    "trai_analytics": {
        "kind": "partner_portal", "url": "https://analytics.trai.gov.in",
        "summary": "TRAI's public analytics portal for mobile data experience. No API found.",
        "access": "Web portal", "sdk": None},
    "ndma_sachet": {
        "kind": "partner_portal", "url": "https://sachet.ndma.gov.in/",
        "summary": "The national CAP alert portal. Public warnings are issued there by authorised agencies, never through IndTrana.",
        "access": "Read: open. Issue: authorised agencies only", "sdk": None},
}

# Logo marks bundled offline in apps/web/lib/network-logos.ts (Simple Icons 15.22.0, CC0). Other providers show the
# neutral kind icon and a monogram. Never drawn or approximated.
LOGO_KEYS = frozenset({"spacex", "airtel", "jio"})

KINDS = ("satellite", "terrestrial_mobile", "terrestrial_fixed", "tower_operator", "public_reference")
ORBIT_CLASSES = ("leo", "meo", "geo", "mixed")
GROUPS = ("starlink", "oneweb", "iridium-NEXT", "globalstar", "orbcomm", "intelsat", "ses", "gnss", "geo")
BANDS = ("L", "S", "C", "Ku", "Ka", "UHF", "700", "800", "900", "1800", "2100", "2300", "2500", "3300", "26000", "fibre")
COLOURS = ("c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8")
ASSET_TYPES = ("constellation", "satellite", "gateway", "tower", "cell", "fibre_node")
STATES = ("up", "degraded", "down")


def public_catalogue() -> dict:
    return {"verified_on": VERIFIED_ON, "links": DOC_LINKS, "logo_keys": sorted(LOGO_KEYS), "kinds": KINDS,
            "orbit_classes": ORBIT_CLASSES, "groups": GROUPS, "bands": BANDS, "colours": COLOURS,
            "asset_types": ASSET_TYPES, "states": STATES}
