"""A register's head becomes a person only when it NAMES one. Registers fill an empty post with a
placeholder (24 Nov 2026: 335 posts showed "-- --", "nd nd", "Nn Dd", "Vacante Vacante" or
"da_indicare da_indicare" as their holder, IT IndicePA). Run: python3 ETL/terms/test_register_people.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from load_register_heads import is_person_name  # noqa: E402

# the property, not a list: unseen placeholders of the same shapes must fail too
NOT_A_PERSON = ["-- --", "--- ---", "-- -- -- --", "nd nd", "N.D. N.D.", "Nn Dd", "xx xx", "Vacante Vacante",
                "VACANTE vacante", "da_indicare da_indicare", "Presidente Presidente", "TBD TBD", "", None, "   "]
PERSON = ["Paul-François Fournier", "Élisa ETCHEGARAY", "Nynke TIGCHELAAR", "Jean-Robert JOURDAN", "Li Bo",
          "Ng Yu", "Adeline Lemaire", "Ursula von der Leyen", "Ó Briain Eoin"]

for n in NOT_A_PERSON:
    assert not is_person_name(n), f"a placeholder read as a person: {n!r}"
for n in PERSON:
    assert is_person_name(n), f"a person read as a placeholder: {n!r}"
print("register people: ok")
