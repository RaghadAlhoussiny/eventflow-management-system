/**
 * organiser.js
 * Routes for organiser functionality - managing events and site settings
 */

const express = require("express");
const router = express.Router();

// Display organiser home page with site info and events
router.get("/", (req, res, next) => {
    // Get site settings first
    const settingsQuery = "SELECT * FROM site_settings LIMIT 1";
    
    global.db.get(settingsQuery, (err, settings) => {
        if (err) {
            next(err);
        } else {
            // Create default settings if none exists
            if (!settings) {
                const defaultSettings = "INSERT INTO site_settings (site_name, site_description) VALUES (?, ?)";
                global.db.run(defaultSettings, ['EventFlow', 'Professional event management made simple'], function(err) {
                    if (err) {
                        next(err);
                    } else {
                        // Get the newly created settings
                        global.db.get(settingsQuery, (err, newSettings) => {
                            if (err) {
                                next(err);
                            } else {
                                getEventsAndRender(newSettings);
                            }
                        });
                    }
                });
            } else {
                getEventsAndRender(settings);
            }
        }
    });

    // Helper function to retrieve events and render the page
    function getEventsAndRender(settings) {
        // Get published events ordered by date
        const publishedQuery = "SELECT * FROM events WHERE status = 'published' ORDER BY event_date ASC";
        global.db.all(publishedQuery, (err, publishedEvents) => {
            if (err) {
                next(err);
            } else {
                // Get draft events ordered by creation date
                const draftQuery = "SELECT * FROM events WHERE status = 'draft' ORDER BY created_date DESC";
                global.db.all(draftQuery, (err, draftEvents) => {
                    if (err) {
                        next(err);
                    } else {
                        res.render('organiser-home', {
                            settings: settings,
                            publishedEvents: publishedEvents,
                            draftEvents: draftEvents
                        });
                    }
                });
            }
        });
    }
});

// Display site settings page
router.get("/settings", (req, res, next) => {
    const query = "SELECT * FROM site_settings LIMIT 1";
    global.db.get(query, (err, settings) => {
        if (err) {
            next(err);
        } else {
            // Use default values if no settings exist
            if (!settings) {
                settings = {
                    site_name: 'EventFlow',
                    site_description: 'Professional event management made simple'
                };
            }
            res.render('site-settings', { settings: settings });
        }
    });
});

// Update site settings and redirect to organiser home
router.post("/settings", (req, res, next) => {
    const { site_name, site_description } = req.body;
    
    // Validate inputs
    if (!site_name || !site_description) {
        return res.status(400).send("Site name and description are required");
    }

    // Check if settings exist in database
    const checkQuery = "SELECT * FROM site_settings LIMIT 1";
    global.db.get(checkQuery, (err, existing) => {
        if (err) {
            next(err);
        } else if (existing) {
            // Update existing settings
            const updateQuery = "UPDATE site_settings SET site_name = ?, site_description = ? WHERE setting_id = ?";
            global.db.run(updateQuery, [site_name, site_description, existing.setting_id], (err) => {
                if (err) {
                    next(err);
                } else {
                    res.redirect('/organiser');
                }
            });
        } else {
            // Insert new settings
            const insertQuery = "INSERT INTO site_settings (site_name, site_description) VALUES (?, ?)";
            global.db.run(insertQuery, [site_name, site_description], (err) => {
                if (err) {
                    next(err);
                } else {
                    res.redirect('/organiser');
                }
            });
        }
    });
});

// Create a new draft event and redirect to edit page
router.post("/create-event", (req, res, next) => {
    const query = "INSERT INTO events (title, description, categories, status, created_date, last_modified) VALUES (?, ?, ?, ?, ?, ?)";
    const now = new Date().toISOString();
    
    // Create event with only General category - organizer must select additional ones
    global.db.run(query, ['New Event', 'Please add a description for your event...', 'General', 'draft', now, now], function(err) {
        if (err) {
            console.error("Error creating new event:", err);
            next(err);
        } else {
            res.redirect(`/organiser/edit-event/${this.lastID}`);
        }
    });
});

// Display edit event page
router.get("/edit-event/:id", (req, res, next) => {
    const eventId = req.params.id;
    const query = "SELECT * FROM events WHERE event_id = ?";
    
    global.db.get(query, [eventId], (err, event) => {
        if (err) {
            console.error("Error fetching event for edit:", err);
            next(err);
        } else if (!event) {
            res.status(404).send("Event not found");
        } else {
            res.render('edit-event', { event: event });
        }
    });
});

// Update event details including categories
router.post("/edit-event/:id", (req, res, next) => {
    const eventId = req.params.id;
    const { title, description, event_date, full_price_tickets, full_price_cost, concession_tickets, concession_cost } = req.body;
    
    // Handle multiple categories 
    let categories = req.body.categories || [];
    if (typeof categories === 'string') {
        categories = [categories]; // Convert single selection to array
    }
    
    // Always include General category
    if (!categories.includes('General')) {
        categories.unshift('General');
    }
    
    const categoriesString = categories.join(',');
    
    // Validate required fields
    if (!title || !description) {
        return res.status(400).send("Title and description are required");
    }
    
    if (categories.length <= 1) { // Only General is selected
        return res.status(400).send("Please select at least one category in addition to General");
    }

    // Update event in database
    const query = `UPDATE events SET 
                   title = ?, description = ?, categories = ?, event_date = ?, 
                   full_price_tickets = ?, full_price_cost = ?, 
                   concession_tickets = ?, concession_cost = ?, 
                   last_modified = ? 
                   WHERE event_id = ?`;
    
    const now = new Date().toISOString();
    
    global.db.run(query, [
        title, description, categoriesString, event_date, 
        full_price_tickets || 0, full_price_cost || 0, 
        concession_tickets || 0, concession_cost || 0, 
        now, eventId
    ], (err) => {
        if (err) {
            console.error("Error updating event:", err);
            next(err);
        } else {
            res.redirect('/organiser');
        }
    });
});

// Publish an event (change status from draft to published)
router.post("/publish-event/:id", (req, res, next) => {
    const eventId = req.params.id;
    
    // Validate event has required fields before publishing
    const checkQuery = "SELECT title, description, categories FROM events WHERE event_id = ?";
    
    global.db.get(checkQuery, [eventId], (err, event) => {
        if (err) {
            console.error("Error checking event before publish:", err);
            next(err);
        } else if (!event) {
            res.status(404).send("Event not found");
        } else {
            const categories = event.categories ? event.categories.split(',') : [];
            const hasAdditionalCategory = categories.some(cat => cat.trim() !== 'General');
            // Check all required fields are completed
            if (!event.title || !event.description || !hasAdditionalCategory) {
                res.status(400).send("Cannot publish event: Title, description, and at least one category (in addition to General) are required.");
            } else {
                // Publish the event
                const now = new Date().toISOString();
                const publishQuery = "UPDATE events SET status = 'published', published_date = ?, last_modified = ? WHERE event_id = ?";
                
                global.db.run(publishQuery, [now, now, eventId], (err) => {
                    if (err) {
                        console.error("Error publishing event:", err);
                        next(err);
                    } else {
                        res.redirect('/organiser');
                    }
                });
            }
        }
    });
});

// Delete an event from database
router.post("/delete-event/:id", (req, res, next) => {
    const eventId = req.params.id;
    
    // First delete any bookings for this event
    const deleteBookingsQuery = "DELETE FROM bookings WHERE event_id = ?";
    global.db.run(deleteBookingsQuery, [eventId], (err) => {
        if (err) {
            console.error("Error deleting bookings for event:", err);
            next(err);
        } else {
            // Then delete any view tracking for this event
            const deleteViewsQuery = "DELETE FROM event_views WHERE event_id = ?";
            global.db.run(deleteViewsQuery, [eventId], (err) => {
                if (err) {
                    console.error("Error deleting views for event:", err);
                    // Continue anyway, don't fail the deletion
                }
                
                // Finally delete the event
                const deleteEventQuery = "DELETE FROM events WHERE event_id = ?";
                global.db.run(deleteEventQuery, [eventId], (err) => {
                    if (err) {
                        console.error("Error deleting event:", err);
                        next(err);
                    } else {
                        res.redirect('/organiser');
                    }
                });
            });
        }
    });
});

// Display all bookings for a specific event
router.get("/event/:id/bookings", (req, res, next) => {
    const eventId = req.params.id;
    
    // Get event details first
    const eventQuery = "SELECT * FROM events WHERE event_id = ?";
    
    global.db.get(eventQuery, [eventId], (err, event) => {
        if (err) {
            console.error("Error fetching event for bookings:", err);
            next(err);
        } else if (!event) {
            res.status(404).send("Event not found");
        } else {
            // Get all bookings for this event
            const bookingsQuery = `SELECT 
                                   booking_id,
                                   attendee_name,
                                   full_tickets_booked,
                                   concession_tickets_booked,
                                   booking_date
                                   FROM bookings 
                                   WHERE event_id = ?
                                   ORDER BY booking_date DESC`;
            
            global.db.all(bookingsQuery, [eventId], (err, bookings) => {
                if (err) {
                    console.error("Error fetching bookings:", err);
                    next(err);
                } else {
                    // Calculate booking statistics
                    let totalFullTickets = 0;
                    let totalConcessionTickets = 0;
                    let totalRevenue = 0;
                    let totalBookings = bookings.length;
                    
                    // Process each booking to calculate totals and individual costs
                    const processedBookings = bookings.map(booking => {
                        const fullTickets = parseInt(booking.full_tickets_booked) || 0;
                        const concessionTickets = parseInt(booking.concession_tickets_booked) || 0;
                        const fullCost = fullTickets * (parseFloat(event.full_price_cost) || 0);
                        const concessionCost = concessionTickets * (parseFloat(event.concession_cost) || 0);
                        const bookingTotal = fullCost + concessionCost;
                        
                        totalFullTickets += fullTickets;
                        totalConcessionTickets += concessionTickets;
                        totalRevenue += bookingTotal;
                        
                        return {
                            ...booking,
                            booking_total: bookingTotal.toFixed(2),
                            full_cost: fullCost.toFixed(2),
                            concession_cost: concessionCost.toFixed(2),
                            total_tickets: fullTickets + concessionTickets,
                            formatted_date: new Date(booking.booking_date).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })
                        };
                    });
                    
                    // Calculate remaining tickets
                    const remainingFull = Math.max(0, (parseInt(event.full_price_tickets) || 0) - totalFullTickets);
                    const remainingConcession = Math.max(0, (parseInt(event.concession_tickets) || 0) - totalConcessionTickets);
                    const totalTicketsAvailable = (parseInt(event.full_price_tickets) || 0) + (parseInt(event.concession_tickets) || 0);
                    const totalTicketsSold = totalFullTickets + totalConcessionTickets;
                    
                    res.render('event-bookings', {
                        event: event,
                        bookings: processedBookings,
                        stats: {
                            totalBookings: totalBookings,
                            totalFullTickets: totalFullTickets,
                            totalConcessionTickets: totalConcessionTickets,
                            totalTicketsSold: totalTicketsSold,
                            totalRevenue: totalRevenue.toFixed(2),
                            remainingFull: remainingFull,
                            remainingConcession: remainingConcession,
                            totalTicketsAvailable: totalTicketsAvailable,
                            soldOutPercentage: totalTicketsAvailable > 0 ? ((totalTicketsSold / totalTicketsAvailable) * 100).toFixed(1) : 0
                        }
                    });
                }
            });
        }
    });
});

// Display all bookings across all events (summary view)
router.get("/all-bookings", (req, res, next) => {
    // Get all bookings with event information
    const allBookingsQuery = `SELECT 
                              b.booking_id,
                              b.attendee_name,
                              b.full_tickets_booked,
                              b.concession_tickets_booked,
                              b.booking_date,
                              e.title as event_title,
                              e.event_id,
                              e.full_price_cost,
                              e.concession_cost,
                              e.event_date
                              FROM bookings b
                              JOIN events e ON b.event_id = e.event_id
                              ORDER BY b.booking_date DESC`;
    
    global.db.all(allBookingsQuery, (err, allBookings) => {
        if (err) {
            console.error("Error fetching all bookings:", err);
            next(err);
        } else {
            // Process bookings with calculations
            const processedBookings = allBookings.map(booking => {
                const fullTickets = parseInt(booking.full_tickets_booked) || 0;
                const concessionTickets = parseInt(booking.concession_tickets_booked) || 0;
                const fullCost = fullTickets * (parseFloat(booking.full_price_cost) || 0);
                const concessionCost = concessionTickets * (parseFloat(booking.concession_cost) || 0);
                const bookingTotal = fullCost + concessionCost;
                
                return {
                    ...booking,
                    booking_total: bookingTotal.toFixed(2),
                    total_tickets: fullTickets + concessionTickets,
                    formatted_date: new Date(booking.booking_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                };
            });
            
            // Calculate overall statistics
            const totalRevenue = processedBookings.reduce((sum, booking) => sum + parseFloat(booking.booking_total), 0);
            const totalTicketsSold = processedBookings.reduce((sum, booking) => sum + booking.total_tickets, 0);
            
            res.render('all-bookings', {
                bookings: processedBookings,
                stats: {
                    totalBookings: processedBookings.length,
                    totalRevenue: totalRevenue.toFixed(2),
                    totalTicketsSold: totalTicketsSold
                }
            });
        }
    });
});

// Export the router object so index.js can access it
module.exports = router;