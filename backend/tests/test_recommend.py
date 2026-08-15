"""
Unit tests for the Fuel Intelligence recommendation service.

Covers the deterministic core without any API key or network:
* intent normalisation (LLM JSON -> FuelSearchIntent) and the keyword fallback
* deterministic ranking: price, distance, verification, freshness, availability
* honesty of explanations: no invented prices, no invented verification,
  provenance labels preserved
* graceful degradation when the AI provider is missing/failing
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app.services.ai import recommend
from app.services.ai.base import AINotConfiguredError

NOW = datetime(2026, 8, 15, 12, 0, 0, tzinfo=timezone.utc)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def make_station(**overrides) -> dict:
    station = {
        "id": str(uuid.uuid4()),
        "name": "Test Station",
        "brand": None,
        "address": None,
        "city": "Test City",
        "state": "Test State",
        "phone": None,
        "latitude": 10.52,
        "longitude": 7.44,
        "is_active": True,
        "data_source": "seed",
        "verification_status": "unverified",
        "verified_at": None,
        "last_verified_at": None,
        "source_id": None,
        "fuel_types": [{"code": "PMS", "name": "Petrol (PMS)"}],
        "created_at": NOW - timedelta(days=10),
        "updated_at": NOW - timedelta(days=1),
        "distance_meters": 1000.0,
    }
    station.update(overrides)
    return station


def make_price_entry(
    price: float,
    fuel: str = "PMS",
    status: str = "verified",
    created_at: datetime | None = None,
) -> dict:
    return {
        "fuel_type_code": fuel,
        "price_per_litre": price,
        "status": status,
        "created_at": created_at or NOW - timedelta(days=1),
    }


# --------------------------------------------------------------------------- #
# Intent extraction
# --------------------------------------------------------------------------- #
class TestIntentNormalisation:
    def test_cheapest_petrol_maps_to_pms_price_preference(self) -> None:
        intent = recommend.to_fuel_intent(
            {"fuel_type": "PMS", "sort_preference": "price"}, "cheapest petrol"
        )
        assert intent.fuel_type == "PMS"
        assert intent.sort_preference == "price"
        assert intent.max_price is None  # nothing invented

    def test_closest_cng_maps_to_distance_preference(self) -> None:
        intent = recommend.to_fuel_intent(
            {"fuel_type": "CNG", "sort_preference": "distance"}, "closest CNG"
        )
        assert intent.fuel_type == "CNG"
        assert intent.sort_preference == "distance"

    def test_diesel_under_1000_maps_to_ago_max_price(self) -> None:
        intent = recommend.to_fuel_intent(
            {"fuel_type": "AGO", "max_price": 1000}, "diesel under 1000"
        )
        assert intent.fuel_type == "AGO"
        assert intent.max_price == 1000
        assert intent.min_price is None

    def test_values_are_normalised(self) -> None:
        intent = recommend.to_fuel_intent(
            {
                "fuel_type": "pms",
                "sort_preference": "Cheapest",
                "max_price": "900",
                "require_verified": True,
                "radius_meters": 500,
            },
            "raw",
        )
        assert intent.fuel_type == "PMS"
        assert intent.sort_preference == "price"
        assert intent.max_price == 900
        assert intent.require_verified is True
        assert intent.radius_meters == 500

    def test_unknown_fuel_and_sort_are_dropped(self) -> None:
        intent = recommend.to_fuel_intent(
            {"fuel_type": "XYZ", "sort_preference": "whatever"}, ""
        )
        assert intent.fuel_type is None
        assert intent.sort_preference is None

    def test_contradictory_price_bounds_are_swapped(self) -> None:
        intent = recommend.to_fuel_intent({"min_price": 900, "max_price": 700}, "")
        assert intent.min_price == 700
        assert intent.max_price == 900

    def test_radius_is_clamped_to_sane_window(self) -> None:
        assert recommend.to_fuel_intent({"radius_meters": 1}, "").radius_meters == 200
        assert (
            recommend.to_fuel_intent({"radius_meters": 10_000_000}, "").radius_meters
            == 100_000
        )

    def test_empty_payload_yields_only_defaults(self) -> None:
        intent = recommend.to_fuel_intent({}, "hello")
        assert intent.fuel_type is None
        assert intent.max_price is None
        assert intent.sort_preference is None
        assert intent.require_verified is False
        assert intent.radius_meters is None
        assert intent.raw == "hello"


class TestFallbackIntentParser:
    def test_cheapest_petrol(self) -> None:
        intent = recommend.parse_intent_fallback("Find the cheapest petrol near me")
        assert intent.fuel_type == "PMS"
        assert intent.sort_preference == "price"

    def test_closest_cng(self) -> None:
        intent = recommend.parse_intent_fallback("Where is the closest CNG station?")
        assert intent.fuel_type == "CNG"
        assert intent.sort_preference == "distance"

    def test_diesel_under_1000(self) -> None:
        intent = recommend.parse_intent_fallback("I need diesel under ₦1000")
        assert intent.fuel_type == "AGO"
        assert intent.max_price == 1000

    def test_petrol_below_900(self) -> None:
        intent = recommend.parse_intent_fallback("Find petrol below ₦900 per litre")
        assert intent.fuel_type == "PMS"
        assert intent.max_price == 900

    def test_most_reliable(self) -> None:
        intent = recommend.parse_intent_fallback(
            "Which nearby station is most reliable?"
        )
        assert intent.sort_preference == "reliability"

    def test_best_combination(self) -> None:
        intent = recommend.parse_intent_fallback(
            "Which nearby station has the best combination of price and distance?"
        )
        assert intent.sort_preference == "best_overall"

    def test_radius_extraction(self) -> None:
        intent = recommend.parse_intent_fallback("find petrol within 2 km")
        assert intent.radius_meters == 2000

    def test_cooking_gas_is_lpg_not_cng(self) -> None:
        intent = recommend.parse_intent_fallback("where can I get cooking gas")
        assert intent.fuel_type == "LPG"

    def test_explicit_verified_request(self) -> None:
        intent = recommend.parse_intent_fallback("only verified stations with petrol")
        assert intent.require_verified is True
        assert intent.sort_preference == "reliability"

    def test_garbage_query_yields_defaults_only(self) -> None:
        intent = recommend.parse_intent_fallback("asdf qwerty 12345")
        assert intent.fuel_type is None
        assert intent.sort_preference is None
        assert intent.max_price is None
        assert intent.require_verified is False


class TestExtractIntentGracefulDegradation:
    def test_groq_used_when_available(self, monkeypatch) -> None:
        def fake_parse(text: str) -> recommend.FuelSearchIntent:
            return recommend.FuelSearchIntent(fuel_type="PMS", raw=text)

        monkeypatch.setattr(recommend, "parse_recommend_intent", fake_parse)
        intent, source = recommend.extract_intent("petrol please")
        assert source == "groq"
        assert intent.fuel_type == "PMS"

    def test_falls_back_when_groq_missing(self, monkeypatch) -> None:
        def fake_parse(text: str):
            raise AINotConfiguredError("no key")

        monkeypatch.setattr(recommend, "parse_recommend_intent", fake_parse)
        intent, source = recommend.extract_intent("cheapest diesel")
        assert source == "fallback"
        assert intent.fuel_type == "AGO"
        assert intent.sort_preference == "price"

    def test_falls_back_on_provider_timeout(self, monkeypatch) -> None:
        def fake_parse(text: str):
            raise TimeoutError("AI timed out")

        monkeypatch.setattr(recommend, "parse_recommend_intent", fake_parse)
        intent, source = recommend.extract_intent("closest petrol")
        assert source == "fallback"
        assert intent.sort_preference == "distance"


# --------------------------------------------------------------------------- #
# Ranking
# --------------------------------------------------------------------------- #
class TestRanking:
    def test_cheaper_station_wins_when_price_is_prioritised(self) -> None:
        cheap = make_station(
            name="Cheap Station", distance_meters=1200.0
        )
        pricey = make_station(
            name="Pricey Station", distance_meters=1100.0
        )
        intent = recommend.FuelSearchIntent(
            fuel_type="PMS", sort_preference="price", raw="cheapest petrol"
        )
        price_map = {
            str(cheap["id"]): [make_price_entry(850)],
            str(pricey["id"]): [make_price_entry(950)],
        }
        ranked = recommend.rank_recommendations([cheap, pricey], intent, price_map, NOW)
        assert ranked[0].station["name"] == "Cheap Station"
        assert ranked[0].breakdown["price"] > ranked[1].breakdown["price"]

    def test_closer_station_wins_when_distance_is_prioritised(self) -> None:
        close = make_station(name="Close Station", distance_meters=300.0)
        far = make_station(name="Far Station", distance_meters=4000.0)
        intent = recommend.FuelSearchIntent(
            fuel_type="PMS", sort_preference="distance", raw="closest petrol"
        )
        ranked = recommend.rank_recommendations(
            [far, close], intent, {}, NOW
        )
        assert ranked[0].station["name"] == "Close Station"

    def test_verified_station_receives_higher_trust_score(self) -> None:
        verified = make_station(
            name="Verified", verification_status="verified", distance_meters=1000.0
        )
        unverified = make_station(
            name="Unverified", verification_status="unverified", distance_meters=900.0
        )
        intent = recommend.FuelSearchIntent(
            sort_preference="reliability", raw="most reliable"
        )
        ranked = recommend.rank_recommendations(
            [verified, unverified], intent, {}, NOW
        )
        by_name = {r.station["name"]: r for r in ranked}
        assert (
            by_name["Verified"].breakdown["verification"]
            > by_name["Unverified"].breakdown["verification"]
        )
        assert ranked[0].station["name"] == "Verified"

    def test_stale_data_is_penalised(self) -> None:
        fresh = make_station(
            name="Fresh", updated_at=NOW - timedelta(days=1), distance_meters=1000.0
        )
        stale = make_station(
            name="Stale", updated_at=NOW - timedelta(days=400), distance_meters=1000.0
        )
        intent = recommend.FuelSearchIntent(
            sort_preference="reliability", raw="most reliable"
        )
        ranked = recommend.rank_recommendations([fresh, stale], intent, {}, NOW)
        by_name = {r.station["name"]: r for r in ranked}
        assert by_name["Fresh"].breakdown["freshness"] > 0.9
        assert by_name["Stale"].breakdown["freshness"] == 0.0
        assert ranked[0].station["name"] == "Fresh"

    def test_station_without_requested_fuel_is_excluded(self) -> None:
        petrol = make_station(name="Petrol", fuel_types=[{"code": "PMS", "name": "Petrol"}])
        diesel_only = make_station(
            name="Diesel Only", fuel_types=[{"code": "AGO", "name": "Diesel"}]
        )
        intent = recommend.FuelSearchIntent(fuel_type="PMS", raw="petrol")
        ranked = recommend.rank_recommendations(
            [petrol, diesel_only], intent, {}, NOW
        )
        assert [r.station["name"] for r in ranked] == ["Petrol"]

    def test_known_price_above_max_is_excluded_but_unknown_kept(self) -> None:
        ok = make_station(name="OK", distance_meters=500.0)
        too_pricey = make_station(name="Too Pricey", distance_meters=600.0)
        unknown = make_station(name="Unknown Price", distance_meters=700.0)
        intent = recommend.FuelSearchIntent(
            fuel_type="PMS", max_price=900, raw="petrol under 900"
        )
        price_map = {
            str(ok["id"]): [make_price_entry(850)],
            str(too_pricey["id"]): [make_price_entry(1100)],
        }
        ranked = recommend.rank_recommendations(
            [ok, too_pricey, unknown], intent, price_map, NOW
        )
        names = [r.station["name"] for r in ranked]
        assert "Too Pricey" not in names
        assert "Unknown Price" in names

    def test_require_verified_filters_unverified_rows(self) -> None:
        verified = make_station(
            name="V", verification_status="verified", distance_meters=1000.0
        )
        unverified = make_station(
            name="U", verification_status="unverified", distance_meters=500.0
        )
        intent = recommend.FuelSearchIntent(
            require_verified=True, fuel_type="PMS", raw="verified petrol"
        )
        ranked = recommend.rank_recommendations([verified, unverified], intent, {}, NOW)
        assert [r.station["name"] for r in ranked] == ["V"]

    def test_tie_break_is_deterministic(self) -> None:
        a = make_station(name="A Station", distance_meters=500.0)
        b = make_station(name="B Station", distance_meters=500.0)
        intent = recommend.FuelSearchIntent(
            fuel_type="PMS", sort_preference="best_overall", raw="best station"
        )
        first = recommend.rank_recommendations([b, a], intent, {}, NOW)
        second = recommend.rank_recommendations([a, b], intent, {}, NOW)
        assert first[0].station["name"] == "A Station"
        assert second[0].station["name"] == "A Station"

    def test_weights_sum_to_one_for_every_preference(self) -> None:
        for weights in recommend.SCORE_WEIGHTS.values():
            assert abs(sum(weights.values()) - 1.0) < 1e-9

    def test_scores_are_bounded(self) -> None:
        stations = [
            make_station(name=f"S{i}", distance_meters=float(i * 100))
            for i in range(1, 6)
        ]
        intent = recommend.FuelSearchIntent(fuel_type="PMS")
        for item in recommend.rank_recommendations(stations, intent, {}, NOW):
            assert 0.0 <= item.score <= 1.0


# --------------------------------------------------------------------------- #
# Explanations — honesty
# --------------------------------------------------------------------------- #
class TestExplanations:
    def test_fallback_answer_for_no_stations_is_honest(self) -> None:
        intent = recommend.FuelSearchIntent(fuel_type="PMS")
        answer = recommend.build_deterministic_answer(intent, [], 0)
        assert "couldn't find a nearby station" in answer

    def test_missing_price_is_stated_not_invented(self) -> None:
        station = make_station(name="No Price Co", distance_meters=800.0)
        intent = recommend.FuelSearchIntent(
            fuel_type="PMS", sort_preference="price", raw="cheapest petrol"
        )
        ranked = recommend.rank_recommendations([station], intent, {}, NOW)
        answer = recommend.build_deterministic_answer(intent, ranked, 1)
        assert "price information is currently unavailable" in answer.lower()
        assert "₦" not in answer  # never invents a price

    def test_answer_uses_known_price_when_available(self) -> None:
        station = make_station(name="Priced Co", distance_meters=800.0)
        intent = recommend.FuelSearchIntent(
            fuel_type="PMS", sort_preference="price", raw="cheapest petrol"
        )
        price_map = {str(station["id"]): [make_price_entry(850)]}
        ranked = recommend.rank_recommendations([station], intent, price_map, NOW)
        answer = recommend.build_deterministic_answer(intent, ranked, 1)
        assert "₦850" in answer

    def test_unverified_station_is_never_called_verified(self) -> None:
        station = make_station(
            name="Imported Co",
            data_source="imported",
            verification_status="unverified",
            distance_meters=800.0,
        )
        intent = recommend.FuelSearchIntent(
            sort_preference="reliability", raw="most reliable"
        )
        ranked = recommend.rank_recommendations([station], intent, {}, NOW)
        answer = recommend.build_deterministic_answer(intent, ranked, 1)
        assert "verified" not in answer.lower()

        reason = recommend.build_station_reason(intent, ranked[0], ranked)
        assert "verified" not in reason.lower()

    def test_verified_station_can_be_called_verified(self) -> None:
        station = make_station(
            name="Checked Co", verification_status="verified", distance_meters=800.0
        )
        intent = recommend.FuelSearchIntent(
            sort_preference="reliability", raw="most reliable"
        )
        ranked = recommend.rank_recommendations([station], intent, {}, NOW)
        answer = recommend.build_deterministic_answer(intent, ranked, 1)
        assert "verified" in answer.lower()

    def test_several_strong_options_message(self) -> None:
        stations = [
            make_station(name=f"Twin {i}", distance_meters=500.0)
            for i in range(2)
        ]
        intent = recommend.FuelSearchIntent(fuel_type="PMS")
        ranked = recommend.rank_recommendations(stations, intent, {}, NOW)
        answer = recommend.build_deterministic_answer(intent, ranked, 2)
        assert "strong options" in answer

    def test_explanation_prompt_carries_facts_and_honesty_rules(self) -> None:
        station = make_station(
            name="Fact Co", verification_status="unverified", distance_meters=750.0
        )
        intent = recommend.FuelSearchIntent(
            fuel_type="PMS", sort_preference="price", raw="cheapest petrol"
        )
        price_map = {str(station["id"]): [make_price_entry(880)]}
        ranked = recommend.rank_recommendations([station], intent, price_map, NOW)
        prompt = recommend.build_explanation_prompt(intent, ranked)
        assert "Fact Co" in prompt
        assert "880" in prompt
        assert '"unverified"' in prompt
        assert "never invent" in prompt.lower()
        assert "Price information is currently unavailable" in prompt

    def test_explanation_response_parsing(self) -> None:
        answer = recommend.parse_explanation_response(
            '```json\n{"answer": "This station is the closest."}\n```'
        )
        assert answer == "This station is the closest."
        assert recommend.parse_explanation_response("not json at all") == ""
        assert recommend.parse_explanation_response(None) == ""
        assert recommend.parse_explanation_response('{"answer": ""}') == ""

    def test_reason_prefers_verified_fact_only_when_true(self) -> None:
        unverified = make_station(
            name="U Co",
            verification_status="unverified",
            updated_at=NOW - timedelta(days=400),  # stale -> no freshness brag
            distance_meters=500.0,
        )
        intent = recommend.FuelSearchIntent(
            sort_preference="reliability", raw="reliable"
        )
        ranked = recommend.rank_recommendations([unverified], intent, {}, NOW)
        reason = recommend.build_station_reason(intent, ranked[0], ranked)
        assert "no station is verified" in reason.lower()


# --------------------------------------------------------------------------- #
# Orchestration-level caching (DB mocked; everything else real)
# --------------------------------------------------------------------------- #
class TestRecommendStationsCache:
    async def test_cached_result_skips_repeat_pipeline(self, monkeypatch) -> None:
        recommend.clear_recommend_cache()
        calls = {"nearby": 0}

        async def fake_find_nearby(db, latitude, longitude, **kwargs):
            calls["nearby"] += 1
            return {
                "items": [make_station(name="Cached Co", distance_meters=400.0)],
                "latitude": latitude,
                "longitude": longitude,
                "radius_meters": kwargs.get("radius_meters"),
            }

        async def fake_prices(db, station_ids, fuel_type_code=None):
            return {}

        monkeypatch.setattr(
            "app.services.stations.find_nearby", fake_find_nearby
        )
        monkeypatch.setattr(
            "app.services.reports.latest_prices_by_station", fake_prices
        )
        monkeypatch.setattr(
            recommend,
            "parse_recommend_intent",
            lambda text: recommend.FuelSearchIntent(
                fuel_type="PMS", sort_preference="distance", raw=text
            ),
        )
        monkeypatch.setattr(
            recommend,
            "generate_explanation",
            lambda intent, top: (_ for _ in ()).throw(
                AINotConfiguredError("no key")
            ),
        )

        first = await recommend.recommend_stations(
            None, "closest petrol", 10.52, 7.44
        )
        second = await recommend.recommend_stations(
            None, "closest petrol", 10.52, 7.44
        )
        assert calls["nearby"] == 1  # second call served from the cache
        assert first == second
        assert first["intent_source"] == "groq"
        assert first["answer_source"] == "fallback"
        recommend.clear_recommend_cache()
