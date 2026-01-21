-- View: public.allocations_view
CREATE OR REPLACE VIEW public.allocations_view AS
SELECT
    a.id,
    a.intern_id,
    i.name AS intern_name,
    a.start_date,
    a.end_date,
    r.id AS room_id,
    r.room_number,
    r.single,
    r.shared,
    r.price,
    ap.id AS apartment_id,
    ap.apartment_name
FROM
    allocations a
    JOIN intern_details i ON i.intern_id = a.intern_id
    JOIN rooms r ON r.id = a.room_id
    JOIN apartments ap ON ap.id = r.apartment_id;