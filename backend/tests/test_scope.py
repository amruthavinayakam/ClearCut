from backend.app.scope import DocumentScope, IntendedUseProfile, assess_scope


def test_streaming_gap_is_partial() -> None:
    intended = IntendedUseProfile(media=["theatrical", "streaming"], territories=["US"])
    scope = DocumentScope(media=["theatrical"], territories=["US"], perpetual=True)

    result = assess_scope(intended, scope)

    assert result.outcome == "partial"
    assert result.gaps == ["Streaming is not listed in recorded media."]


def test_expired_term_is_reported_before_coverage() -> None:
    intended = IntendedUseProfile(
        media=["streaming"], territories=["US"], starts_on="2027-01-01"
    )
    scope = DocumentScope(
        media=["streaming"], territories=["US"], ends_on="2026-12-31"
    )

    result = assess_scope(intended, scope)

    assert result.outcome == "expired"
    assert result.gaps == ["Recorded term ends before intended use begins."]


def test_missing_metadata_is_unknown() -> None:
    result = assess_scope(
        IntendedUseProfile(media=["broadcast"], territories=["CA"]),
        DocumentScope(),
    )

    assert result.outcome == "unknown"
    assert "Recorded media is missing." in result.gaps
    assert "Recorded territories are missing." in result.gaps


def test_complete_recorded_scope_covers_the_profile() -> None:
    result = assess_scope(
        IntendedUseProfile(media=["festival"], territories=["US"]),
        DocumentScope(media=["festival"], territories=["US"], perpetual=True),
    )

    assert result.outcome == "covers"
    assert result.gaps == []
